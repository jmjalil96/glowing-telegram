# Testing Workflow

The API test stack is:

- Vitest
- Testcontainers PostgreSQL
- Testcontainers Inbucket SMTP/HTTP capture
- Real child-process server boots with `node --import tsx src/main.ts`

The current strategy is integration-first. Most confidence comes from exercising
the deployed HTTP/process boundary, real PostgreSQL containers, real SMTP
capture, and the real server bootstrap with minimal mocking.

## Commands

Run tests from the repo root:

```sh
pnpm test
pnpm test:coverage
pnpm --filter @techbros/api run test:watch
```

Or from `apps/api`:

```sh
pnpm test
pnpm test:coverage
pnpm test:watch
```

DB-backed tests require Docker because the suites start PostgreSQL and Inbucket
containers through Testcontainers.

Coverage reports are written to `apps/api/coverage/` and include text, HTML,
LCOV, and `json-summary` outputs. Coverage is collected with `c8` instead of
Vitest's in-process provider because the API suites execute the real server in
child Node processes and the subprocess coverage needs to be included too.

## Current Test Suites

- `tests/operations/server.process.test.ts`
  - startup success with a reachable, migrated database
  - startup failure with an unreachable database
  - startup failure with a reachable but schema-mismatched database
  - startup failure when the configured port is already in use
  - liveness staying healthy during database outages
  - readiness failing during database outages and recovering after restoration
  - graceful shutdown on `SIGTERM`
- `tests/contracts/http-contract.process.test.ts`
  - versioned route contract
  - stable success/error JSON responses
  - `x-request-id` generation and echo
  - representative login success shape
- `tests/contracts/input-validation.process.test.ts`
  - malformed JSON and payload limit handling
  - validation error envelope and details
  - body-field validation semantics
  - externally visible email normalization
- `tests/modules/identity/auth-session.process.test.ts`
  - login/session establishment
  - protected-route access
  - logout revocation and cookie clearing
  - expired, revoked, and deactivated-user session behavior
- `tests/modules/identity/authorization-isolation.process.test.ts`
  - inactive/unverified account authorization gates
  - per-session logout isolation
  - cross-user and cross-tenant session identity separation
  - password-reset revocation affecting only the target user
- `tests/modules/identity/password-reset.process.test.ts`
  - forgot-password -> email -> reset-password -> login workflow
  - reset-link invalidation and single-use behavior
  - session revocation during password reset
  - unverified-user recovery through reset
- `tests/modules/identity/auth-state.process.test.ts`
  - session and revocation persistence across API restarts
  - immediate read-after-write auth-state consistency
  - reset-token concurrency safety
- `tests/contracts/error-contract.process.test.ts`
  - stable error envelope across parser, validation, auth, and internal errors
  - deterministic repeated failures
  - `500 INTERNAL_ERROR` behavior during dependency failures
- `tests/operations/external-side-effects.process.test.ts`
  - reset email delivery contract
  - audit-log side effects for auth flows
  - response-to-audit `requestId` correlation
- `tests/operations/security-resilience.process.test.ts`
  - credentialed CORS allow/deny behavior
  - cookie hardening in `test` and `production`
  - minimal intentional security headers
  - SMTP/database degraded behavior
  - forgot-password anti-enumeration at the HTTP boundary

## Test Environment Behavior

- `apps/api/tests/setup/test-env.ts` sets stable defaults for:
  - `NODE_ENV=test`
  - `PORT=3000`
  - `DATABASE_URL` pointing at an unreachable local port
- Most contract suites start the real API in a child process and pass
  per-suite environment overrides directly to that process
- DB suites run migrations explicitly against disposable PostgreSQL containers
- Email workflow and side-effect suites use disposable Inbucket containers to
  capture outbound mail over real SMTP
- Resilience suites use a TCP proxy to simulate dependency loss without
  changing the API's configured `DATABASE_URL`
- Some suites start a dedicated `NODE_ENV=production` process to verify
  production-only cookie behavior without mutating the main test process

## Notes

- The suite is intentionally light on isolated unit tests.
- DB tests use real PostgreSQL containers instead of mocks or in-memory
  substitutes.
- Process contract tests start the real server entrypoint and verify behavior
  over HTTP, signals, SMTP capture, and dependency failures.
- Startup and readiness both require PostgreSQL connectivity and the exact
  expected Drizzle migration version for the current build.
- Current coverage is organized around architecture-facing suites: contracts,
  identity module behavior, operations, and cross-domain consistency.
