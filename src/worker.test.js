const sinon = require('sinon');
const assert = require('assert');
const tmp = require('tmp-promise');

const processBatch = require('./worker');

const MockWebhookQueue = {
  queue: [],
  reset() {
    this.queue = [];
  },

  push(data) {
    const id = (new Date()).getTime();
    this.queue.push({id, data});
    return Promise.resolve(id);
  },
  pop() {
    const popped = this.queue.pop();
    return Promise.resolve(popped ? popped : null);
  },
};

const MockWebhookStatusStore = {
  keys: {},
  links: {},
  reset() {
    this.keys = {};
    this.links = {};
  },

  set(webhookId, status) {
    const id = (new Date()).getTime();
    this.keys[webhookId] = {status, id};
    return Promise.resolve(id);
  },
  get(webhookId) {
    return Promise.resolve(this.keys[webhookId].status);
  },
  attachToLink(linkId, webhookId) {
    this.links[linkId] = [
      ...(this.links[linkId] || []),
      webhookId,
    ];
    return Promise.resolve();
  }
};

describe('webhook worker', () => {
  // Before each test, reset both mocks.
  beforeEach(() => {
    MockWebhookQueue.reset();
    MockWebhookStatusStore.reset();
  });

  it('should create a pull request when given a single fork', async () => {
    const createPullRequest = require('./helpers').createPullRequest;
    const getForksForRepo = sinon.stub().resolves([{
      owner: {login: 'foo'},
      name: 'bar',
    }]);
    const didRepoOptOut = sinon.stub().resolves(false);
    const githubPullRequestsCreate = () => sinon.stub().yields(null);

    const enqueuedAs = await MockWebhookQueue.push({
      type: 'MANUAL',
      user: {
        id: 1,
        username: '1egoman',
        email: null,
        githubId: '1704236',
        accessToken: 'ACCESS TOKEN',
        publicScope: false,
        createdAt: '2017-08-09T12:00:36.000Z',
        lastLoggedInAt: '2017-08-16T12:50:40.203Z',
        updatedAt: '2017-08-16T12:50:40.204Z',
      },
      link: {
        id: 8,
        name: 'My Link',
        enabled: true,
        webhookId: '37948270678a440a97db01ebe71ddda2',
        lastSyncedAt: '2017-08-17T11:37:22.999Z',
        upstreamType: 'repo',
        upstreamOwner: '1egoman',
        upstreamRepo: 'backstroke',
        upstreamIsFork: null,
        upstreamBranches: '["inject","master"]',
        upstreamBranch: 'master',
        forkType: 'repo',
        forkOwner: 'rgaus',
        forkRepo: 'backstroke',
        forkBranches: '["master"]',
        forkBranch: 'master',
        createdAt: '2017-08-11T10:17:09.614Z',
        updatedAt: '2017-08-17T11:37:23.001Z',
        ownerId: 1,
        owner: {
          id: 1,
          username: '1egoman',
          email: null,
          githubId: '1704236',
          accessToken: 'ACCESS TOKEN',
          publicScope: false,
          createdAt: '2017-08-09T12:00:36.000Z',
          lastLoggedInAt: '2017-08-16T12:50:40.203Z',
          updatedAt: '2017-08-16T12:50:40.204Z',
        }
      },
    });

    // Run the worker that eats off the queue.
    await processBatch(
      MockWebhookQueue,
      MockWebhookStatusStore,
      () => null, //console.log.bind(console, '* '),
      getForksForRepo,
      createPullRequest,
      didRepoOptOut,
      githubPullRequestsCreate
    );

    // Make sure that it worked
    const response = MockWebhookStatusStore.keys[enqueuedAs].status;
    assert.equal(response.status, 'OK');
    assert.deepEqual(response.output, {
      isEnabled: true,
      many: false,
      forkCount: 1,
      response: 'Successfully synced link.',
    });

    // Make sure that the operation was properly attached to the link
    // 8 = link id, enqueuedAs = link operation id
    assert.deepEqual(MockWebhookStatusStore.links[8], [enqueuedAs]);
  });
  it('should create a pull request when given a single fork to a custom branch', async () => {
    const createPullRequest = require('./helpers').createPullRequest;
    const getForksForRepo = sinon.stub().resolves([{
      owner: {login: 'foo'},
      name: 'bar',
    }]);
    const didRepoOptOut = sinon.stub().resolves(false);
    const pr = sinon.stub().yields(null);
    const githubPullRequestsCreate = () => pr;

    const enqueuedAs = await MockWebhookQueue.push({
      type: 'MANUAL',
      user: {
        id: 1,
        username: '1egoman',
        email: null,
        githubId: '1704236',
        accessToken: 'ACCESS TOKEN',
        publicScope: false,
        createdAt: '2017-08-09T12:00:36.000Z',
        lastLoggedInAt: '2017-08-16T12:50:40.203Z',
        updatedAt: '2017-08-16T12:50:40.204Z',
      },
      link: {
        id: 8,
        name: 'My Link',
        enabled: true,
        webhookId: '37948270678a440a97db01ebe71ddda2',
        lastSyncedAt: '2017-08-17T11:37:22.999Z',
        upstreamType: 'repo',
        upstreamOwner: '1egoman',
        upstreamRepo: 'backstroke',
        upstreamIsFork: null,
        upstreamBranches: '["inject","master"]',
        upstreamBranch: 'master',
        forkType: 'repo',
        forkOwner: 'rgaus',
        forkRepo: 'backstroke',
        forkBranches: '["master"]',
        forkBranch: 'some-branch-that-is-not-master', // <--
        createdAt: '2017-08-11T10:17:09.614Z',
        updatedAt: '2017-08-17T11:37:23.001Z',
        ownerId: 1,
        owner: {
          id: 1,
          username: '1egoman',
          email: null,
          githubId: '1704236',
          accessToken: 'ACCESS TOKEN',
          publicScope: false,
          createdAt: '2017-08-09T12:00:36.000Z',
          lastLoggedInAt: '2017-08-16T12:50:40.203Z',
          updatedAt: '2017-08-16T12:50:40.204Z',
        }
      },
    });

    // Run the worker that eats off the queue.
    await processBatch(
      MockWebhookQueue,
      MockWebhookStatusStore,
      () => null, //console.log.bind(console, '* '),
      getForksForRepo,
      createPullRequest,
      didRepoOptOut,
      githubPullRequestsCreate
    );

    // Make sure that it worked
    const response = MockWebhookStatusStore.keys[enqueuedAs].status;
    assert.equal(response.status, 'OK');
    assert.deepEqual(response.output, {
      isEnabled: true,
      many: false,
      forkCount: 1,
      response: 'Successfully synced link.',
    });

    // Make sure that the operation was properly attached to the link
    // 8 = link id, enqueuedAs = link operation id
    assert.deepEqual(MockWebhookStatusStore.links[8], [enqueuedAs]);

    // Make sure that the pull request was created with the custom branch
    assert.equal(pr.callCount, 1);
    assert.equal(pr.firstCall.args[0].head, '1egoman:master');
    assert.equal(pr.firstCall.args[0].base, 'some-branch-that-is-not-master');
  });
  it('should create a pull request on each fork when given a bunch of forks', async () => {
    const createPullRequest = require('./helpers').createPullRequest;
    const getForksForRepo = sinon.stub().resolves([
      {owner: {login: 'hello'}, name: 'world'},
      {owner: {login: 'another'}, name: 'repo'},
    ]);
    const didRepoOptOut = sinon.stub().resolves(false);
    const didRepoOptInToPullRequests = sinon.stub().resolves(true);

    const pullRequestMock = sinon.stub().yields(null);
    const githubPullRequestsCreate = () => pullRequestMock;

    const enqueuedAs = await MockWebhookQueue.push({
      type: 'MANUAL',
      user: {
        id: 1,
        username: '1egoman',
        email: null,
        githubId: '1704236',
        accessToken: 'ACCESS TOKEN',
        publicScope: false,
        createdAt: '2017-08-09T12:00:36.000Z',
        lastLoggedInAt: '2017-08-16T12:50:40.203Z',
        updatedAt: '2017-08-16T12:50:40.204Z',
      },
      link: {
        id: 8,
        name: 'foo',
        enabled: true,
        webhookId: '37948270678a440a97db01ebe71ddda2',
        lastSyncedAt: '2017-08-17T11:37:22.999Z',
        upstreamType: 'repo',
        upstreamOwner: '1egoman',
        upstreamRepo: 'biome',
        upstreamIsFork: null,
        upstreamBranches: '["inject","master"]',
        upstreamBranch: 'master',
        forkType: 'fork-all',
        forkOwner: undefined,
        forkRepo: undefined,
        forkBranches: undefined,
        forkBranch: undefined,
        createdAt: '2017-08-11T10:17:09.614Z',
        updatedAt: '2017-08-17T11:37:23.001Z',
        ownerId: 1,
        owner: {
          id: 1,
          username: '1egoman',
          email: null,
          githubId: '1704236',
          accessToken: 'ACCESS TOKEN',
          publicScope: false,
          createdAt: '2017-08-09T12:00:36.000Z',
          lastLoggedInAt: '2017-08-16T12:50:40.203Z',
          updatedAt: '2017-08-16T12:50:40.204Z',
        }
      },
    });

    // Run the worker that eats off the queue.
    await processBatch(
      MockWebhookQueue,
      MockWebhookStatusStore,
      () => null, //console.log.bind(console, '* '),
      getForksForRepo,
      createPullRequest,
      didRepoOptOut,
      githubPullRequestsCreate,
      didRepoOptInToPullRequests
    );

    // Make sure that it worked
    const response = MockWebhookStatusStore.keys[enqueuedAs].status;
    assert.equal(response.status, 'OK');
    assert.deepEqual(response.output, {
      many: true,
      metrics: {total: 2, successes: 2},
      errors: [],
      isEnabled: true,
    });

    // Should have created two pull requests.
    assert.equal(pullRequestMock.callCount, 2);

    // Make sure that the operation was properly attached to the link
    // 8 = link id, enqueuedAs = link operation id
    assert.deepEqual(MockWebhookStatusStore.links[8], [enqueuedAs]);
  });

  it('should try to make a PR to a single fork of an upstream, but the repo opted out', async () => {
    const createPullRequest = require('./helpers').createPullRequest;
    const getForksForRepo = sinon.stub().resolves([{
      owner: {login: 'foo'},
      name: 'bar',
    }]);
    const didRepoOptOut = sinon.stub().resolves(true);

    const pullRequestMock = sinon.stub().yields(null);
    const githubPullRequestsCreate = () => pullRequestMock;

    const enqueuedAs = await MockWebhookQueue.push({
      type: 'MANUAL',
      user: {
        id: 1,
        username: '1egoman',
        email: null,
        githubId: '1704236',
        accessToken: 'ACCESS TOKEN',
        publicScope: false,
        createdAt: '2017-08-09T12:00:36.000Z',
        lastLoggedInAt: '2017-08-16T12:50:40.203Z',
        updatedAt: '2017-08-16T12:50:40.204Z',
      },
      link: {
        id: 8,
        name: 'foo',
        enabled: true,
        webhookId: '37948270678a440a97db01ebe71ddda2',
        lastSyncedAt: '2017-08-17T11:37:22.999Z',
        upstreamType: 'repo',
        upstreamOwner: '1egoman',
        upstreamRepo: 'biome',
        upstreamIsFork: null,
        upstreamBranches: '["inject","master"]',
        upstreamBranch: 'master',
        forkType: 'repo',
        forkOwner: 'rgaus',
        forkRepo: 'biome',
        forkBranches: '["master"]',
        forkBranch: 'master',
        createdAt: '2017-08-11T10:17:09.614Z',
        updatedAt: '2017-08-17T11:37:23.001Z',
        ownerId: 1,
        owner: {
          id: 1,
          username: '1egoman',
          email: null,
          githubId: '1704236',
          accessToken: 'ACCESS TOKEN',
          publicScope: false,
          createdAt: '2017-08-09T12:00:36.000Z',
          lastLoggedInAt: '2017-08-16T12:50:40.203Z',
          updatedAt: '2017-08-16T12:50:40.204Z',
        }
      },
    });

    // Run the worker that eats off the queue.
    await processBatch(
      MockWebhookQueue,
      MockWebhookStatusStore,
      () => null, //console.log.bind(console, '* '),
      getForksForRepo,
      createPullRequest,
      didRepoOptOut,
      githubPullRequestsCreate
    );

    // Make sure that it worked
    const response = MockWebhookStatusStore.keys[enqueuedAs].status;
    assert.equal(response.status, 'ERROR');
    assert.equal(response.output.error, 'This repo opted out of backstroke pull requests');
  });
  it('should try to make a PR to a single fork of an upstream, but a pull request already exists', async () => {
    const createPullRequest = require('./helpers').createPullRequest;
    const getForksForRepo = sinon.stub().resolves([{
      owner: {login: 'foo'},
      name: 'bar',
    }]);
    const didRepoOptOut = sinon.stub().resolves(false);

    const pullRequestMock = sinon.stub().yields({code: 422}); // 422 = pull request already exists
    const githubPullRequestsCreate = () => pullRequestMock;

    const enqueuedAs = await MockWebhookQueue.push({
      type: 'MANUAL',
      user: {
        id: 1,
        username: '1egoman',
        email: null,
        githubId: '1704236',
        accessToken: 'ACCESS TOKEN',
        publicScope: false,
        createdAt: '2017-08-09T12:00:36.000Z',
        lastLoggedInAt: '2017-08-16T12:50:40.203Z',
        updatedAt: '2017-08-16T12:50:40.204Z',
      },
      link: {
        id: 8,
        name: 'foo',
        enabled: true,
        webhookId: '37948270678a440a97db01ebe71ddda2',
        lastSyncedAt: '2017-08-17T11:37:22.999Z',
        upstreamType: 'repo',
        upstreamOwner: '1egoman',
        upstreamRepo: 'biome',
        upstreamIsFork: null,
        upstreamBranches: '["inject","master"]',
        upstreamBranch: 'master',
        forkType: 'repo',
        forkOwner: 'rgaus',
        forkRepo: 'biome',
        forkBranches: '["master"]',
        forkBranch: 'master',
        createdAt: '2017-08-11T10:17:09.614Z',
        updatedAt: '2017-08-17T11:37:23.001Z',
        ownerId: 1,
        owner: {
          id: 1,
          username: '1egoman',
          email: null,
          githubId: '1704236',
          accessToken: 'ACCESS TOKEN',
          publicScope: false,
          createdAt: '2017-08-09T12:00:36.000Z',
          lastLoggedInAt: '2017-08-16T12:50:40.203Z',
          updatedAt: '2017-08-16T12:50:40.204Z',
        }
      },
    });

    // Run the worker that eats off the queue.
    await processBatch(
      MockWebhookQueue,
      MockWebhookStatusStore,
      () => null, //console.log.bind(console, '* '),
      getForksForRepo,
      createPullRequest,
      didRepoOptOut,
      githubPullRequestsCreate
    );

    // Make sure that it worked
    const response = MockWebhookStatusStore.keys[enqueuedAs].status;
    assert.equal(response.status, 'OK');
    assert.equal(response.output.response, `There's already a pull request on rgaus/biome`);
  });
  it('should try to make a PR to a single fork of an upstream, but an unknown error happens', async () => {
    const createPullRequest = require('./helpers').createPullRequest;
    const getForksForRepo = sinon.stub().resolves([{
      owner: {login: 'foo'},
      name: 'bar',
    }]);
    const didRepoOptOut = sinon.stub().resolves(false);

    const pullRequestMock = sinon.stub().yields(new Error('Unknown Error!'));
    const githubPullRequestsCreate = () => pullRequestMock;

    const enqueuedAs = await MockWebhookQueue.push({
      type: 'MANUAL',
      user: {
        id: 1,
        username: '1egoman',
        email: null,
        githubId: '1704236',
        accessToken: 'ACCESS TOKEN',
        publicScope: false,
        createdAt: '2017-08-09T12:00:36.000Z',
        lastLoggedInAt: '2017-08-16T12:50:40.203Z',
        updatedAt: '2017-08-16T12:50:40.204Z',
      },
      link: {
        id: 8,
        name: 'foo',
        enabled: true,
        webhookId: '37948270678a440a97db01ebe71ddda2',
        lastSyncedAt: '2017-08-17T11:37:22.999Z',
        upstreamType: 'repo',
        upstreamOwner: '1egoman',
        upstreamRepo: 'biome',
        upstreamIsFork: null,
        upstreamBranches: '["inject","master"]',
        upstreamBranch: 'master',
        forkType: 'repo',
        forkOwner: 'rgaus',
        forkRepo: 'biome',
        forkBranches: '["master"]',
        forkBranch: 'master',
        createdAt: '2017-08-11T10:17:09.614Z',
        updatedAt: '2017-08-17T11:37:23.001Z',
        ownerId: 1,
        owner: {
          id: 1,
          username: '1egoman',
          email: null,
          githubId: '1704236',
          accessToken: 'ACCESS TOKEN',
          publicScope: false,
          createdAt: '2017-08-09T12:00:36.000Z',
          lastLoggedInAt: '2017-08-16T12:50:40.203Z',
          updatedAt: '2017-08-16T12:50:40.204Z',
        }
      },
    });

    // Run the worker that eats off the queue.
    await processBatch(
      MockWebhookQueue,
      MockWebhookStatusStore,
      () => null, //console.log.bind(console, '* '),
      getForksForRepo,
      createPullRequest,
      didRepoOptOut,
      githubPullRequestsCreate
    );

    // Make sure that it worked
    const response = MockWebhookStatusStore.keys[enqueuedAs].status;
    assert.equal(response.status, 'ERROR');
    assert.equal(response.output.error, `Couldn't create pull request on repository rgaus/biome: Unknown Error!`);
  });
  it('should make a PR to a single fork of an upstream, but the link is disabled', async () => {
    const createPullRequest = require('./helpers').createPullRequest;
    const getForksForRepo = sinon.stub().resolves([{
      owner: {login: 'foo'},
      name: 'bar',
    }]);
    const didRepoOptOut = sinon.stub().resolves(false);

    const pullRequestMock = sinon.stub().yields(null);
    const githubPullRequestsCreate = () => pullRequestMock;

    const enqueuedAs = await MockWebhookQueue.push({
      type: 'MANUAL',
      user: {
        id: 1,
        username: '1egoman',
        email: null,
        githubId: '1704236',
        accessToken: 'ACCESS TOKEN',
        publicScope: false,
        createdAt: '2017-08-09T12:00:36.000Z',
        lastLoggedInAt: '2017-08-16T12:50:40.203Z',
        updatedAt: '2017-08-16T12:50:40.204Z',
      },
      link: {
        id: 8,
        name: 'foo',
        enabled: false,
        webhookId: '37948270678a440a97db01ebe71ddda2',
        lastSyncedAt: '2017-08-17T11:37:22.999Z',
        upstreamType: 'repo',
        upstreamOwner: '1egoman',
        upstreamRepo: 'biome',
        upstreamIsFork: null,
        upstreamBranches: '["inject","master"]',
        upstreamBranch: 'master',
        forkType: 'repo',
        forkOwner: 'rgaus',
        forkRepo: 'biome',
        forkBranches: '["master"]',
        forkBranch: 'master',
        createdAt: '2017-08-11T10:17:09.614Z',
        updatedAt: '2017-08-17T11:37:23.001Z',
        ownerId: 1,
        owner: {
          id: 1,
          username: '1egoman',
          email: null,
          githubId: '1704236',
          accessToken: 'ACCESS TOKEN',
          publicScope: false,
          createdAt: '2017-08-09T12:00:36.000Z',
          lastLoggedInAt: '2017-08-16T12:50:40.203Z',
          updatedAt: '2017-08-16T12:50:40.204Z',
        }
      },
    });

    // Run the worker that eats off the queue.
    await processBatch(
      MockWebhookQueue,
      MockWebhookStatusStore,
      () => null, //console.log.bind(console, '* '),
      getForksForRepo,
      createPullRequest,
      didRepoOptOut,
      githubPullRequestsCreate
    );

    // Make sure that it worked
    const response = MockWebhookStatusStore.keys[enqueuedAs].status;
    assert.equal(response.status, 'ERROR');
    assert.equal(response.output.error, 'Link is not enabled.');
  });
  it('should make a PR to a single fork of an upstream, but upstream / fork are null', async () => {
    const createPullRequest = sinon.stub().yields([null]);
    const getForksForRepo = sinon.stub().resolves([{
      owner: {login: 'foo'},
      name: 'bar',
    }]);
    const didRepoOptOut = sinon.stub().resolves(false);

    const enqueuedAs = await MockWebhookQueue.push({
      type: 'MANUAL',
      user: {
        id: 1,
        username: '1egoman',
        email: null,
        githubId: '1704236',
        accessToken: 'ACCESS TOKEN',
        publicScope: false,
        createdAt: '2017-08-09T12:00:36.000Z',
        lastLoggedInAt: '2017-08-16T12:50:40.203Z',
        updatedAt: '2017-08-16T12:50:40.204Z',
      },
      link: {
        id: 8,
        name: 'foo',
        enabled: true,
        webhookId: '37948270678a440a97db01ebe71ddda2',
        lastSyncedAt: '2017-08-17T11:37:22.999Z',
        upstreamType: undefined,
        upstreamOwner: undefined,
        upstreamRepo: undefined,
        upstreamIsFork: undefined,
        upstreamBranches: undefined,
        upstreamBranch: undefined,
        forkType: undefined,
        forkOwner: undefined,
        forkRepo: undefined,
        forkBranches: undefined,
        forkBranch: undefined,
        createdAt: '2017-08-11T10:17:09.614Z',
        updatedAt: '2017-08-17T11:37:23.001Z',
        ownerId: 1,
        owner: {
          id: 1,
          username: '1egoman',
          email: null,
          githubId: '1704236',
          accessToken: 'ACCESS TOKEN',
          publicScope: false,
          createdAt: '2017-08-09T12:00:36.000Z',
          lastLoggedInAt: '2017-08-16T12:50:40.203Z',
          updatedAt: '2017-08-16T12:50:40.204Z',
        }
      },
    });

    // Run the worker that eats off the queue.
    await processBatch(
      MockWebhookQueue,
      MockWebhookStatusStore,
      () => null, // console.log.bind(console, '* '),
      getForksForRepo,
      createPullRequest,
      didRepoOptOut
    );

    // Make sure that it worked
    const response = MockWebhookStatusStore.keys[enqueuedAs].status;
    assert.equal(response.status, 'ERROR');
    assert.equal(response.output.error, 'Please define both an upstream and fork on this link.');
  });
  it(`should make a PR to a single fork of an upstream, but fork is a repository that doesn't exist`, async () => {
    const createPullRequest = sinon.stub().yields([null]);
    const getForksForRepo = sinon.stub().resolves([{
      owner: {login: 'foo'},
      name: 'bar',
    }]);
    const didRepoOptOut = sinon.stub().rejects(new Error(`Repository foo/bar doesn't exist!`));

    const enqueuedAs = await MockWebhookQueue.push({
      type: 'MANUAL',
      user: {
        id: 1,
        username: '1egoman',
        email: null,
        githubId: '1704236',
        accessToken: 'ACCESS TOKEN',
        publicScope: false,
        createdAt: '2017-08-09T12:00:36.000Z',
        lastLoggedInAt: '2017-08-16T12:50:40.203Z',
        updatedAt: '2017-08-16T12:50:40.204Z',
      },
      link: {
        id: 8,
        name: 'My Link',
        enabled: true,
        webhookId: '37948270678a440a97db01ebe71ddda2',
        lastSyncedAt: '2017-08-17T11:37:22.999Z',
        upstreamType: 'repo',
        upstreamOwner: '1egoman',
        upstreamRepo: 'backstroke',
        upstreamIsFork: null,
        upstreamBranches: '["inject","master"]',
        upstreamBranch: 'master',
        forkType: 'repo',
        forkOwner: 'rgaus',
        forkRepo: 'backstroke',
        forkBranches: '["master"]',
        forkBranch: 'master',
        createdAt: '2017-08-11T10:17:09.614Z',
        updatedAt: '2017-08-17T11:37:23.001Z',
        ownerId: 1,
        owner: {
          id: 1,
          username: '1egoman',
          email: null,
          githubId: '1704236',
          accessToken: 'ACCESS TOKEN',
          publicScope: false,
          createdAt: '2017-08-09T12:00:36.000Z',
          lastLoggedInAt: '2017-08-16T12:50:40.203Z',
          updatedAt: '2017-08-16T12:50:40.204Z',
        }
      },
    });

    // Run the worker that eats off the queue.
    await processBatch(
      MockWebhookQueue,
      MockWebhookStatusStore,
      () => null, // console.log.bind(console, '* '),
      getForksForRepo,
      require('./helpers').createPullRequest,
      didRepoOptOut
    );

    // Make sure that it worked
    const response = MockWebhookStatusStore.keys[enqueuedAs].status;
    assert.equal(response.status, 'ERROR');
    assert.equal(response.output.error, `Repository foo/bar doesn't exist!`);
  });

  it('should create a pull request on each fork when given a bunch of forks, but one fails', async () => {
    const createPullRequest = require('./helpers').createPullRequest;
    const getForksForRepo = sinon.stub().resolves([
      {owner: {login: 'hello'}, name: 'world'},
      {owner: {login: 'another'}, name: 'repo'},
    ]);
    const didRepoOptOut = sinon.stub().resolves(false);

    const didRepoOptInToPullRequests = sinon.stub().resolves(true);

    const pullRequestMock = sinon.stub();
    pullRequestMock.onCall(0).yields(null);
    pullRequestMock.onCall(1).yields(new Error('Something bad happened.'));
    const githubPullRequestsCreate = () => pullRequestMock;

    const enqueuedAs = await MockWebhookQueue.push({
      type: 'MANUAL',
      user: {
        id: 1,
        username: '1egoman',
        email: null,
        githubId: '1704236',
        accessToken: 'ACCESS TOKEN',
        publicScope: false,
        createdAt: '2017-08-09T12:00:36.000Z',
        lastLoggedInAt: '2017-08-16T12:50:40.203Z',
        updatedAt: '2017-08-16T12:50:40.204Z',
      },
      link: {
        id: 8,
        name: 'foo',
        enabled: true,
        webhookId: '37948270678a440a97db01ebe71ddda2',
        lastSyncedAt: '2017-08-17T11:37:22.999Z',
        upstreamType: 'repo',
        upstreamOwner: '1egoman',
        upstreamRepo: 'biome',
        upstreamIsFork: null,
        upstreamBranches: '["inject","master"]',
        upstreamBranch: 'master',
        forkType: 'fork-all',
        forkOwner: undefined,
        forkRepo: undefined,
        forkBranches: undefined,
        forkBranch: undefined,
        createdAt: '2017-08-11T10:17:09.614Z',
        updatedAt: '2017-08-17T11:37:23.001Z',
        ownerId: 1,
        owner: {
          id: 1,
          username: '1egoman',
          email: null,
          githubId: '1704236',
          accessToken: 'ACCESS TOKEN',
          publicScope: false,
          createdAt: '2017-08-09T12:00:36.000Z',
          lastLoggedInAt: '2017-08-16T12:50:40.203Z',
          updatedAt: '2017-08-16T12:50:40.204Z',
        },
      },
    });

    // Run the worker that eats off the queue.
    await processBatch(
      MockWebhookQueue,
      MockWebhookStatusStore,
      () => null, //console.log.bind(console, '* '),
      getForksForRepo,
      createPullRequest,
      didRepoOptOut,
      githubPullRequestsCreate,
      didRepoOptInToPullRequests
    );

    // Make sure that it worked
    const response = MockWebhookStatusStore.keys[enqueuedAs].status;
    assert.equal(response.status, 'OK');
    assert.deepEqual(response.output, {
      many: true,
      metrics: {total: 2, successes: 1},
      errors: [
        {
          status: 'ERROR',
          error: `Couldn't create pull request on repository another/repo: Something bad happened.`,
        },
      ],
      isEnabled: true,
    });

    // Should have created two pull requests.
    assert.equal(pullRequestMock.callCount, 2);
  });
  it('should create a pull request on each fork when given a bunch of forks, except for one that doesnt opt in', async () => {
    const createPullRequest = require('./helpers').createPullRequest;
    const getForksForRepo = sinon.stub().resolves([
      {owner: {login: 'hello'}, name: 'world'},
      {owner: {login: 'another'}, name: 'repo'},
    ]);
    const didRepoOptOut = sinon.stub().resolves(false);

    const didRepoOptInToPullRequests = sinon.stub();
    didRepoOptInToPullRequests.onCall(0).resolves(true);
    didRepoOptInToPullRequests.onCall(1).resolves(false);

    const pullRequestMock = sinon.stub();
    pullRequestMock.onCall(0).yields(null);
    pullRequestMock.onCall(1).yields(new Error('Something bad happened.'));
    const githubPullRequestsCreate = () => pullRequestMock;

    const enqueuedAs = await MockWebhookQueue.push({
      type: 'MANUAL',
      user: {
        id: 1,
        username: '1egoman',
        email: null,
        githubId: '1704236',
        accessToken: 'ACCESS TOKEN',
        publicScope: false,
        createdAt: '2017-08-09T12:00:36.000Z',
        lastLoggedInAt: '2017-08-16T12:50:40.203Z',
        updatedAt: '2017-08-16T12:50:40.204Z',
      },
      link: {
        id: 8,
        name: 'foo',
        enabled: true,
        webhookId: '37948270678a440a97db01ebe71ddda2',
        lastSyncedAt: '2017-08-17T11:37:22.999Z',
        upstreamType: 'repo',
        upstreamOwner: '1egoman',
        upstreamRepo: 'biome',
        upstreamIsFork: null,
        upstreamBranches: '["inject","master"]',
        upstreamBranch: 'master',
        forkType: 'fork-all',
        forkOwner: undefined,
        forkRepo: undefined,
        forkBranches: undefined,
        forkBranch: undefined,
        createdAt: '2017-08-11T10:17:09.614Z',
        updatedAt: '2017-08-17T11:37:23.001Z',
        ownerId: 1,
        owner: {
          id: 1,
          username: '1egoman',
          email: null,
          githubId: '1704236',
          accessToken: 'ACCESS TOKEN',
          publicScope: false,
          createdAt: '2017-08-09T12:00:36.000Z',
          lastLoggedInAt: '2017-08-16T12:50:40.203Z',
          updatedAt: '2017-08-16T12:50:40.204Z',
        },
      },
    });

    // Run the worker that eats off the queue.
    await processBatch(
      MockWebhookQueue,
      MockWebhookStatusStore,
      () => null, //console.log.bind(console, '* '),
      getForksForRepo,
      createPullRequest,
      didRepoOptOut,
      githubPullRequestsCreate,
      didRepoOptInToPullRequests
    );

    // Make sure that it worked
    const response = MockWebhookStatusStore.keys[enqueuedAs].status;
    assert.equal(response.status, 'OK');
    assert.deepEqual(response.output, {
      many: true,
      metrics: {total: 2, successes: 2},
      errors: [],
      isEnabled: true,
    });

    // Should have created one pull requests. (one repo wasn't allowed)
    assert.equal(pullRequestMock.callCount, 1);

    // Ensure that the call to `didRepoOptInToPullRequests` was called with the right values
    assert.equal(didRepoOptInToPullRequests.firstCall.args[1], 'hello');
    assert.equal(didRepoOptInToPullRequests.firstCall.args[2], 'world');
    assert.equal(didRepoOptInToPullRequests.lastCall.args[1], 'another');
    assert.equal(didRepoOptInToPullRequests.lastCall.args[2], 'repo');
  });

  it('should create a pull request when given a single fork, adding the request id properly', async () => {
    const createPullRequest = require('./helpers').createPullRequest;
    const getForksForRepo = sinon.stub().resolves([{
      owner: {login: 'foo'},
      name: 'bar',
    }]);
    const didRepoOptOut = sinon.stub().resolves(false);
    const githubPullRequestsCreate = () => sinon.stub().yields(null);

    const enqueuedAs = await MockWebhookQueue.push({
      type: 'MANUAL',
      user: {
        id: 1,
        username: '1egoman',
        email: null,
        githubId: '1704236',
        accessToken: 'ACCESS TOKEN',
        publicScope: false,
        createdAt: '2017-08-09T12:00:36.000Z',
        lastLoggedInAt: '2017-08-16T12:50:40.203Z',
        updatedAt: '2017-08-16T12:50:40.204Z',
      },
      link: {
        id: 8,
        name: 'My Link',
        enabled: true,
        webhookId: '37948270678a440a97db01ebe71ddda2',
        lastSyncedAt: '2017-08-17T11:37:22.999Z',
        upstreamType: 'repo',
        upstreamOwner: '1egoman',
        upstreamRepo: 'backstroke',
        upstreamIsFork: null,
        upstreamBranches: '["inject","master"]',
        upstreamBranch: 'master',
        forkType: 'repo',
        forkOwner: 'rgaus',
        forkRepo: 'backstroke',
        forkBranches: '["master"]',
        forkBranch: 'master',
        createdAt: '2017-08-11T10:17:09.614Z',
        updatedAt: '2017-08-17T11:37:23.001Z',
        ownerId: 1,
        owner: {
          id: 1,
          username: '1egoman',
          email: null,
          githubId: '1704236',
          accessToken: 'ACCESS TOKEN',
          publicScope: false,
          createdAt: '2017-08-09T12:00:36.000Z',
          lastLoggedInAt: '2017-08-16T12:50:40.203Z',
          updatedAt: '2017-08-16T12:50:40.204Z',
        }
      },
      fromRequest: 'AC120001:C5A6_AC120009:0050_5A229DF8_0004:0007', /* Example request id */
    });

    // Run the worker that eats off the queue.
    await processBatch(
      MockWebhookQueue,
      MockWebhookStatusStore,
      () => null, //console.log.bind(console, '* '),
      getForksForRepo,
      createPullRequest,
      didRepoOptOut,
      githubPullRequestsCreate
    );

    // Make sure that it worked
    const response = MockWebhookStatusStore.keys[enqueuedAs].status;
    assert.equal(response.status, 'OK');

    // Ensure that the request id ended up in the body of the response.
    assert.deepEqual(response.fromRequest, 'AC120001:C5A6_AC120009:0050_5A229DF8_0004:0007');
  });

  it('should create a pull request when given an unrelated repo, by joining through the bot user account', async () => {
    const createPullRequest = require('./helpers').createPullRequest;
    const getForksForRepo = sinon.stub().resolves([{
      owner: {login: 'foo'},
      name: 'bar',
    }]);
    const didRepoOptOut = sinon.stub().resolves(false);
    const prMock = sinon.stub().yields(null);
    const githubPullRequestsCreate = () => prMock;

    const push = sinon.stub().resolves(false);
    const nodegit = {
      Remote: {
        createAnonymous: sinon.stub().returns({push}),
      },
      Clone: sinon.stub().resolves('nodegit-clone-return'),
    };
    const addBackstrokeBotAsCollaborator = sinon.stub().resolves();
    const forkRepository = sinon.stub().resolves();

    const enqueuedAs = await MockWebhookQueue.push({
      type: 'MANUAL',
      user: {
        id: 1,
        username: '1egoman',
        email: null,
        githubId: '1704236',
        accessToken: 'ACCESS TOKEN',
        publicScope: false,
        createdAt: '2017-08-09T12:00:36.000Z',
        lastLoggedInAt: '2017-08-16T12:50:40.203Z',
        updatedAt: '2017-08-16T12:50:40.204Z',
      },
      link: {
        id: 8,
        name: 'My Link',
        enabled: true,
        webhookId: '37948270678a440a97db01ebe71ddda2',
        lastSyncedAt: '2017-08-17T11:37:22.999Z',
        upstreamType: 'repo',
        upstreamOwner: '1egoman',
        upstreamRepo: 'backstroke',
        upstreamIsFork: null,
        upstreamBranches: '["inject","master"]',
        upstreamBranch: 'master',
        forkType: 'unrelated-repo',
        forkOwner: '1egoman',
        forkRepo: 'my-backstroke-duplicate',
        forkBranches: '["master"]',
        forkBranch: 'master',
        createdAt: '2017-08-11T10:17:09.614Z',
        updatedAt: '2017-08-17T11:37:23.001Z',
        ownerId: 1,
        owner: {
          id: 1,
          username: '1egoman',
          email: null,
          githubId: '1704236',
          accessToken: 'ACCESS TOKEN',
          publicScope: false,
          createdAt: '2017-08-09T12:00:36.000Z',
          lastLoggedInAt: '2017-08-16T12:50:40.203Z',
          updatedAt: '2017-08-16T12:50:40.204Z',
        }
      },
    });

    // Run the worker that eats off the queue.
    await processBatch(
      MockWebhookQueue,
      MockWebhookStatusStore,
      () => null, //console.log.bind(console, '* '),
      getForksForRepo,
      createPullRequest,
      didRepoOptOut,
      githubPullRequestsCreate,
      undefined, // didRepoOptInToPullRequests
      nodegit,
      tmp,
      addBackstrokeBotAsCollaborator,
      forkRepository
    );

    // Make sure that it worked
    const response = MockWebhookStatusStore.keys[enqueuedAs].status;
    assert.equal(response.status, 'OK');
    assert.deepEqual(response.output, {
      isEnabled: true,
      many: false,
      unrelatedForks: true,
      forkCount: 1,
      response: 'Successfully synced link.',
    });

    // Make sure that a temporary fork was created
    assert.equal(forkRepository.callCount, 1);

    // Ensure that the upstream was cloned
    assert.equal(nodegit.Clone.firstCall.args[0], `https://github.com/1egoman/backstroke`);

    // And the cloned upstream was pushed to the fork that was made of the duplicate
    assert.equal(
      nodegit.Remote.createAnonymous.firstCall.args[1],
      `https://github.com/backstroke-bot/my-backstroke-duplicate`
    );
    assert.equal(push.callCount, 1);

    // Also make sure that the pull request was created
    assert.equal(prMock.callCount, 1);
    assert.equal(prMock.firstCall.args[0].owner, '1egoman');
    assert.equal(prMock.firstCall.args[0].repo, 'my-backstroke-duplicate');
    assert.equal(prMock.firstCall.args[0].title, 'Update from upstream repo 1egoman/backstroke@master');
    // Making pull request from temporary repo (branch corresponds to the username the upstream is from)
    assert.equal(prMock.firstCall.args[0].head, 'backstroke-bot:1egoman');
    assert.equal(prMock.firstCall.args[0].base, 'master');
    assert.equal(prMock.firstCall.args[0].maintainer_can_modify, false);
  });
  it('should properly handle the error when an unrelated repo is pushed to github', async () => {
    const createPullRequest = require('./helpers').createPullRequest;
    const getForksForRepo = sinon.stub().resolves([{
      owner: {login: 'foo'},
      name: 'bar',
    }]);
    const didRepoOptOut = sinon.stub().resolves(false);
    const prMock = sinon.stub().yields(null);
    const githubPullRequestsCreate = () => prMock;

    const push = sinon.stub().rejects(new Error('boom!'));
    const nodegit = {
      Remote: {
        createAnonymous: sinon.stub().returns({push}),
      },
      Clone: sinon.stub().resolves('nodegit-clone-return'),
    };
    const addBackstrokeBotAsCollaborator = sinon.stub().resolves();
    const forkRepository = sinon.stub().resolves();

    const enqueuedAs = await MockWebhookQueue.push({
      type: 'MANUAL',
      user: {
        id: 1,
        username: '1egoman',
        email: null,
        githubId: '1704236',
        accessToken: 'ACCESS TOKEN',
        publicScope: false,
        createdAt: '2017-08-09T12:00:36.000Z',
        lastLoggedInAt: '2017-08-16T12:50:40.203Z',
        updatedAt: '2017-08-16T12:50:40.204Z',
      },
      link: {
        id: 8,
        name: 'My Link',
        enabled: true,
        webhookId: '37948270678a440a97db01ebe71ddda2',
        lastSyncedAt: '2017-08-17T11:37:22.999Z',
        upstreamType: 'repo',
        upstreamOwner: '1egoman',
        upstreamRepo: 'backstroke',
        upstreamIsFork: null,
        upstreamBranches: '["inject","master"]',
        upstreamBranch: 'master',
        forkType: 'unrelated-repo',
        forkOwner: '1egoman',
        forkRepo: 'my-backstroke-duplicate',
        forkBranches: '["master"]',
        forkBranch: 'master',
        createdAt: '2017-08-11T10:17:09.614Z',
        updatedAt: '2017-08-17T11:37:23.001Z',
        ownerId: 1,
        owner: {
          id: 1,
          username: '1egoman',
          email: null,
          githubId: '1704236',
          accessToken: 'ACCESS TOKEN',
          publicScope: false,
          createdAt: '2017-08-09T12:00:36.000Z',
          lastLoggedInAt: '2017-08-16T12:50:40.203Z',
          updatedAt: '2017-08-16T12:50:40.204Z',
        }
      },
    });

    // Run the worker that eats off the queue.
    await processBatch(
      MockWebhookQueue,
      MockWebhookStatusStore,
      () => null, //console.log.bind(console, '* '),
      getForksForRepo,
      createPullRequest,
      didRepoOptOut,
      githubPullRequestsCreate,
      undefined, // didRepoOptInToPullRequests
      nodegit,
      tmp,
      addBackstrokeBotAsCollaborator,
      forkRepository
    );

    // Make sure that it worked
    const response = MockWebhookStatusStore.keys[enqueuedAs].status;
    assert.equal(response.status, 'ERROR');
    assert.equal(
      response.output.error,
      'Error received while pushing backstroke-bot/1egoman: boom!'
    );
  });
});
