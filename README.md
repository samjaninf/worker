# Backstroke Worker

The Backstroke Worker eats off of a [rsmq](https://github.com/smrchy/rsmq) queue, performing a link
update. In order, here's roughly what happens:

- A new operation is pulled off the queue.
- The link's type is checked:
  - If the type is `repo`:
    - Check to make sure the fork didn't opt out of Backstroke pull requests.
      - If so, return an error.
    - Create a pull request to propose the new changes.
  - If the type is `fork-all`:
    - Get all forks of the upstream.
    - Loop through each:
      - Check to make sure the fork didn't opt out of Backstroke pull requests.
        - If so, return an error.
      - Create a pull request to propose the new changes.
- Add the response back into the Redis instance under the operation id, so it can be fetched by the
  main server.

## Usage
```
GITHUB_TOKEN=XXX REDIS_URL=redis://XXX yarn start
```

### Environment variables
- `GITHUB_TOKEN`: The Github token for the user that creates pull requests. When deployed, this
  is a token for [backstroke-bot](https://github.com/backstroke-bot).
- `REDIS_URL`: A url to a redis instance with a rsmq queue inside. Takes the form of
  `redis://user:password@host:port`.

## Running tests
  ```
yarn test
  ```