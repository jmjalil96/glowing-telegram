# Testing Workflow

The API test stack is:

- Vitest
- Supertest
- Testcontainers PostgreSQL

The current strategy is integration-first. Most confidence comes from exercising
the Express app, real PostgreSQL containers, and the real server bootstrap with
minimal mocking.

## Commands

Run tests from the repo root:

```sh
pnpm test
pnpm --filter @techbros/api run test:watch
```

Or from `apps/api`:

```sh
pnpm test
pnpm test:watch
```

DB-backed tests require Docker because they start PostgreSQL containers through
Testcontainers.

## Current Test Suites

- `tests/integration/app.integration.test.ts`
  - operational routes
  - not-found behavior
  - request IDs
  - malformed JSON handling
  - sentinel security, CORS allowlisting, and payload size handling
- `tests/integration/db-config.integration.test.ts`
  - pool sizing defaults and overrides
  - readiness client connection/query timeout wiring
- `tests/integration/validate-request.integration.test.ts`
  - params, query, and body validation
  - aggregated validation errors
  - parsed input passed to the `route(...)` handler
- `tests/integration/db.integration.test.ts`
  - migration application
  - `users` table existence
  - unique email constraint
  - readiness against a real database
- `tests/smoke/server.process.test.ts`
  - startup success with a reachable database
  - startup failure with an unreachable database
  - startup failure when the configured port is already in use
  - graceful shutdown on `SIGTERM`

## Test Environment Behavior

- `apps/api/tests/setup/test-env.ts` sets stable defaults for:
  - `NODE_ENV=test`
  - `PORT=3000`
  - `DATABASE_URL` pointing at an unreachable local port
- Suites that need a real database override `DATABASE_URL` first, reset the
  module graph, and then import app/DB modules
- DB suites run migrations explicitly and reset table state between tests

## Notes

- The suite is intentionally light on isolated unit tests.
- DB tests use real PostgreSQL containers instead of mocks or in-memory
  substitutes.
- Process smoke tests start the real server entrypoint and verify runtime
  behavior over HTTP and signals.
