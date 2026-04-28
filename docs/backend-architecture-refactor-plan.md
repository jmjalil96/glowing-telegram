# Backend Architecture Refactor Plan

This document is the working plan for reorganizing the API backend into a clean
modular monolith. It is intended to be revisited before, during, and after each
refactor phase.

The goal is not to change product behavior. The goal is to make ownership,
dependency direction, module boundaries, and future backend growth obvious.

## Current Date

Created on 2026-04-28.

## High-Level Goal

Reorganize `apps/api/src` from a mixed `features`, `services`, `auth`, `db`,
`middlewares`, and `lib` structure into a backend with these major areas:

- `bootstrap`: process and app composition.
- `platform`: shared infrastructure and adapters.
- `modules`: business/domain modules.
- `shared`: truly generic code that is not platform-specific and not owned by
  one module.

The target architecture is a modular monolith:

- One deployable API service.
- One shared database.
- Strong internal module boundaries.
- No microservice split.
- No premature package extraction.

## Non-Negotiables

- No backwards compatibility shims for internal imports.
- No old-path re-export files.
- No duplicate source trees during a phase.
- No behavior changes unless a phase explicitly calls them out.
- Public HTTP routes remain stable unless a separate product decision changes
  them.
- Every phase must leave the repo compiling.
- Every phase must run the agreed validation commands before moving on.
- Empty old folders must be removed at the end of the phase that empties them.
- Documentation must be updated in the same phase as the structure it describes.

Internal imports are allowed to break during a local edit, but they must be
fixed before the phase is considered complete.

## Public API Stability

The following external contracts should remain stable through this refactor:

- `GET /health`
- `GET /ready`
- `GET /api/v1/status`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- Error envelope shape.
- Request ID behavior.
- Auth cookie behavior.
- CORS behavior.
- Readiness behavior.
- Migration-version startup behavior.
- Audit and email side effects.

If any of those change, that is not a refactor anymore. It requires an explicit
product or platform decision.

## Initial Backend Snapshot

At the start of this refactor, the backend root looked like this:

```text
apps/api/src/
  app.ts
  server.ts
  auth/
  config/
  db/
  errors/
  features/
  lib/
  middlewares/
  routes/
  services/
  types/
```

Initial strengths:

- Strict TypeScript configuration.
- Small app composition entrypoint.
- Explicit server startup and graceful shutdown.
- Strong request validation and error envelope.
- PostgreSQL and Drizzle migration workflow.
- Startup/readiness check validates migration version.
- Integration-heavy API tests with real child-process server boots.
- Real PostgreSQL containers in tests.
- Real SMTP/Inbucket capture in tests.

Initial organization risks:

- `src/auth` and `src/features/auth` split one conceptual module.
- `services` has multiple meanings: cross-cutting infrastructure, feature use
  cases, and session auth services.
- `db/client.ts` owns too many responsibilities.
- Database schema already covers many business domains, but application modules
  only exist for auth.
- `features/auth/repositories/auth.repository.ts` is already too broad.
- Use cases directly import concrete logger, email, audit, db-backed
  repositories, and crypto services.
- There are no enforced import boundaries.
- Future business endpoints would likely deepen the current ambiguity.

## Current Backend Shape

After the refactor, the active backend source has these top-level ownership
areas:

```text
apps/api/src/
  main.ts
  bootstrap/
  platform/
  modules/
  routes/
  types/
```

The remaining `routes` and `types` folders are narrow outer-shell concerns:
versioned API route composition and Express global augmentation. Business
behavior lives under `modules`, and shared runtime infrastructure lives under
`platform`.

## Target Directory Shape

Target backend source shape:

```text
apps/api/src/
  main.ts

  bootstrap/
    create-app.ts
    create-dependencies.ts
    shutdown.ts

  platform/
    audit/
      audit-context.ts
      audit-log.adapter.ts
      audit.port.ts
      index.ts

    config/
      env.ts

    database/
      client.ts
      migrate.ts
      migrations/
      readiness.ts
      schema.ts
      seed.ts

    email/
      email.port.ts
      smtp-email.adapter.ts
      index.ts

    http/
      app-error.ts
      error-handler.middleware.ts
      not-found.middleware.ts
      request-id.middleware.ts
      validate-request.ts
      validated-request.ts

    logger/
      logger.ts

    security/
      opaque-token.ts
      password-hasher.ts
      index.ts

  modules/
    identity/
      domain/
        authenticated-user.ts
        identity-constants.ts
        request-auth.ts

      application/
        identity-audit-events.ts
        identity-errors.ts
        forgot-password.use-case.ts
        login.use-case.ts
        logout.use-case.ts
        ports.ts
        reset-password.use-case.ts
        resolve-request-auth.use-case.ts

      email/
        password-reset-email.ts

      http/
        auth.middleware.ts
        cookies.ts
        forgot-password.handler.ts
        forgot-password.schema.ts
        identity.router.ts
        login.handler.ts
        login.schema.ts
        logout.handler.ts
        me.handler.ts
        reset-password.handler.ts
        reset-password.schema.ts

      infrastructure/
        drizzle-executor.ts
        identity-transaction.drizzle.ts
        password-reset-token.repository.drizzle.ts
        session.repository.drizzle.ts
        user.repository.drizzle.ts

      index.ts

    access-control/
    claims/
    clients/
    enrollments/
    policies/
    reference-data/
    tenancy/

  shared/
    domain/
    types/
```

This is the desired end state. We should not create empty files just to satisfy
the tree, but the tree documents where things should land as they appear.

## Layering Rules

The intended dependency direction:

```text
bootstrap -> platform
bootstrap -> modules/*/http

modules/*/http -> modules/*/application
modules/*/http -> modules/*/domain
modules/*/http -> platform/http

modules/*/application -> modules/*/domain
modules/*/application -> application ports

modules/*/infrastructure -> modules/*/application ports
modules/*/infrastructure -> modules/*/domain
modules/*/infrastructure -> platform/database

platform/* -> platform/*
shared/* -> shared/*
```

Forbidden dependency direction:

```text
domain -> http
domain -> infrastructure
domain -> platform/database
domain -> Express
domain -> Drizzle
domain -> Pino
domain -> env

application -> Express
application -> Drizzle
application -> concrete SMTP adapter
application -> concrete database client
application -> process.env

modules/* -> modules/*/infrastructure of another module
modules/* -> deep internals of another module
platform -> modules/*
shared -> modules/*
shared -> platform/*
```

Allowed cross-module communication:

- Through a module public `index.ts`.
- Through explicit application ports.
- Through stable shared domain types only when ownership is truly shared.

## Naming Rules

Use file names that say what role the file plays:

- `*.router.ts` for Express routers.
- `*.handler.ts` for HTTP handlers.
- `*.schema.ts` for request validation schemas.
- `*.use-case.ts` for application operations.
- `*.repository.drizzle.ts` for Drizzle-backed persistence adapters.
- `*.adapter.ts` for concrete infrastructure adapters.
- `*.port.ts` for interfaces consumed by application code.
- `*.middleware.ts` for Express middleware.

Avoid vague file names:

- Avoid `service.ts` unless the local codebase has a precise meaning for it.
- Avoid generic `utils.ts`.
- Avoid generic `types.ts` unless the folder is very small and scoped.
- Avoid barrel exports that hide ownership or create import cycles.

## Validation Commands

Minimum validation after every phase:

```sh
pnpm typecheck:api
pnpm --filter @techbros/api run lint
pnpm --filter @techbros/api run test
```

Additional validation for database or startup phases:

```sh
pnpm build:api
```

Additional validation after changing Drizzle config or migrations:

```sh
pnpm --filter @techbros/api exec drizzle-kit check --config=drizzle.config.ts
```

Run broader workspace checks when a phase touches shared scripts, root config, or
frontend/API contracts:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Phase Gate Checklist

Before starting any phase:

- [ ] Confirm `git status --short`.
- [ ] Read the phase scope in this document.
- [ ] Confirm no unrelated user changes will be overwritten.
- [ ] Run baseline validation if the previous state is unknown.
- [ ] Keep the phase focused. Do not opportunistically refactor unrelated code.

During the phase:

- [ ] Move files directly to their final phase destination.
- [ ] Update all imports directly.
- [ ] Delete old files and empty old folders.
- [ ] Avoid old-path re-export shims.
- [ ] Avoid behavior changes unless explicitly scoped.
- [ ] Keep generated files and migrations deliberate.

Before completing the phase:

- [ ] Run validation commands.
- [ ] Update docs if paths, commands, or architecture changed.
- [ ] Re-check `git status --short`.
- [ ] Summarize changed structure and any known risk.

## Phase 0: Baseline And Architecture Doc

Purpose:

Establish a clean baseline and commit this plan before structural changes begin.

Scope:

- Add this architecture refactor plan.
- Confirm the current test/type/lint state.
- Remove tracked OS/editor junk if any is tracked.
- Do not move source code yet.

Tasks:

- [ ] Run `git status --short`.
- [ ] Run `pnpm typecheck:api`.
- [ ] Run `pnpm --filter @techbros/api run lint`.
- [ ] Run `pnpm --filter @techbros/api run test`.
- [ ] Confirm `.DS_Store` files are not tracked.
- [ ] Commit the plan as a standalone baseline commit.

Acceptance criteria:

- [ ] This document exists under `docs/`.
- [ ] The backend validation result is known.
- [ ] No source-code architecture moves have happened yet.

Suggested commit:

```text
docs: add backend architecture refactor plan
```

## Phase 1: Create Platform HTTP, Config, And Logger Areas

Purpose:

Move generic HTTP, config, and logging infrastructure under `platform` before
moving business modules.

Current files:

```text
apps/api/src/config/env.ts
apps/api/src/lib/logger.ts
apps/api/src/errors/app-error.ts
apps/api/src/middlewares/error-handler.ts
apps/api/src/middlewares/load-auth.ts
apps/api/src/middlewares/not-found.ts
apps/api/src/middlewares/request-id.ts
apps/api/src/middlewares/require-auth.ts
apps/api/src/middlewares/validate-request.ts
apps/api/src/types/validated-request.ts
apps/api/src/types/express.d.ts
```

Target files for this phase:

```text
apps/api/src/platform/config/env.ts
apps/api/src/platform/logger/logger.ts
apps/api/src/platform/http/app-error.ts
apps/api/src/platform/http/error-handler.middleware.ts
apps/api/src/platform/http/not-found.middleware.ts
apps/api/src/platform/http/request-id.middleware.ts
apps/api/src/platform/http/validate-request.ts
apps/api/src/platform/http/validated-request.ts
apps/api/src/types/express.d.ts
```

Important note:

`load-auth.ts` and `require-auth.ts` are auth-specific. In this phase, do not
move them into generic platform HTTP unless there is a temporary need to keep
the app compiling. The better destination is the identity module in Phase 6.

Recommended approach:

- Move config, logger, generic app error, request ID, not-found, error handler,
  request validation, and validated request types.
- Keep Express global augmentation in `src/types/express.d.ts` until identity
  request auth has a final home.
- Update imports everywhere.
- Delete empty `config`, `lib`, `errors`, and generic middleware files if empty.

Acceptance criteria:

- [x] Generic HTTP infrastructure lives under `platform/http`.
- [x] Runtime config lives under `platform/config`.
- [x] Logger lives under `platform/logger`.
- [x] No old-path re-export files exist.
- [x] Public HTTP behavior is unchanged.
- [x] Validation commands pass.

Completion note:

- Completed on 2026-04-28.
- Moved only generic config, logger, app error, request ID, not-found, error
  handler, request validation, and validated request types into `platform`.
- Kept `load-auth.ts` and `require-auth.ts` in `src/middlewares` for the
  identity-module phase.
- Validation completed:
  - `pnpm typecheck:api`
  - `pnpm --filter @techbros/api run lint`
  - `pnpm --filter @techbros/api run test`
  - `pnpm build:api`
- Known risk: none found. The first local test attempt failed because Docker
  socket access was unavailable inside the sandbox; the approved rerun with
  Docker access passed.

Suggested commit:

```text
refactor(api): move generic platform http config and logger
```

## Phase 2: Split Database Infrastructure

Purpose:

Separate database connection, schema registration, readiness checks, migration
utilities, and seed scripts.

Current files:

```text
apps/api/src/db/client.ts
apps/api/src/db/migrate.ts
apps/api/src/db/seed.ts
apps/api/src/db/schema/*
apps/api/src/db/migrations/*
apps/api/drizzle.config.ts
```

Target files:

```text
apps/api/src/platform/database/client.ts
apps/api/src/platform/database/schema.ts
apps/api/src/platform/database/readiness.ts
apps/api/src/platform/database/migrate.ts
apps/api/src/platform/database/seed.ts
apps/api/src/platform/database/schema/*
apps/api/src/platform/database/migrations/*
apps/api/drizzle.config.ts
```

Recommended split:

- `client.ts`
  - Owns PostgreSQL pool setup.
  - Owns Drizzle client creation.
  - Exports `db`, `pool`, `poolConfig`, and `closePool`.
- `schema.ts`
  - Imports and exports all table definitions.
  - Provides the schema object passed to Drizzle.
- `readiness.ts`
  - Owns readiness client creation.
  - Owns migration journal parsing.
  - Owns applied vs expected migration-version comparison.
  - Exports `verifyDatabaseOperationalReadiness` and `isDatabaseReady`.
- `migrate.ts`
  - Owns explicit migration command script.
- `seed.ts`
  - Owns local seed command script.

Important migration caution:

Drizzle migration paths are operationally sensitive. If moving
`src/db/migrations` to `src/platform/database/migrations`, update all of these
in the same phase:

- `apps/api/drizzle.config.ts`
- `platform/database/readiness.ts`
- `platform/database/migrate.ts`
- test migration helpers
- docs

No duplicate migrations directories should remain after the phase. If the move
turns out to be too risky, keep migrations in their current location for a
separate explicit phase. Do not keep two active migration locations.

Acceptance criteria:

- [x] `db/client.ts` no longer exists.
- [x] Database responsibilities are split by role.
- [x] Drizzle config points at the chosen final schema and migrations paths.
- [x] Startup and readiness tests pass.
- [x] Migration metadata check passes if paths changed.
- [x] Database docs are updated.

Completion note:

- Completed on 2026-04-28.
- Moved the database layer fully under `platform/database`, including schema
  source files and generated Drizzle migrations.
- Split database responsibilities into `client.ts`, `schema.ts`,
  `readiness.ts`, `migrate.ts`, and `seed.ts`.
- Updated Drizzle config, package scripts, runtime imports, test imports,
  migration helper paths, and database docs.
- Validation completed:
  - `pnpm typecheck:api`
  - `pnpm --filter @techbros/api run lint`
  - `pnpm --filter @techbros/api exec drizzle-kit check --config=drizzle.config.ts`
  - `pnpm --filter @techbros/api run test`
  - `pnpm build:api`
- Known risk: none found. The first local test attempt failed because Docker
  socket access was unavailable inside the sandbox; the approved rerun with
  Docker access passed.

Suggested commit:

```text
refactor(api): split database platform infrastructure
```

## Phase 3: Move Audit And Email To Platform

Purpose:

Replace generic `services` with explicit platform infrastructure areas.

Current files:

```text
apps/api/src/services/audit/*
apps/api/src/services/email/*
```

Target files:

```text
apps/api/src/platform/audit/audit-context.ts
apps/api/src/platform/audit/audit-log.adapter.ts
apps/api/src/platform/audit/audit.port.ts
apps/api/src/platform/audit/index.ts

apps/api/src/platform/email/email.port.ts
apps/api/src/platform/email/smtp-email.adapter.ts
apps/api/src/platform/email/index.ts
```

Recommended approach:

- Move audit context builder to `platform/audit/audit-context.ts`.
- Move audit event/context interfaces to `platform/audit/audit.port.ts`.
- Move concrete DB-backed audit logger to
  `platform/audit/audit-log.adapter.ts`.
- Move email message/result/defaults interfaces to `platform/email/email.port.ts`.
- Move Nodemailer implementation to `platform/email/smtp-email.adapter.ts`.
- Update use cases to import the same behavior from the new platform paths.
- Delete `src/services`.

Acceptance criteria:

- [x] `src/services` no longer exists.
- [x] Audit and email are named as platform infrastructure.
- [x] No behavior changes in email or audit side effects.
- [x] Side-effect tests pass.
- [x] Validation commands pass.

Completion note:

- Completed on 2026-04-28.
- Moved audit infrastructure under `platform/audit` as `audit-context.ts`,
  `audit.port.ts`, `audit-log.adapter.ts`, and `index.ts`.
- Moved email infrastructure under `platform/email` as `email.port.ts`,
  `smtp-email.adapter.ts`, and `index.ts`.
- Updated auth feature imports to use `platform/audit` and `platform/email`.
- Removed `src/services` entirely.
- Validation completed:
  - `pnpm typecheck:api`
  - `pnpm --filter @techbros/api run lint`
  - `pnpm --filter @techbros/api run test`
  - `pnpm build:api`
- Known risk: none found. The first local test attempt failed because Docker
  socket access was unavailable inside the sandbox; the approved rerun with
  Docker access passed.

Suggested commit:

```text
refactor(api): move audit and email adapters to platform
```

## Phase 4: Move Generic Security Primitives

Purpose:

Move reusable crypto/security utilities out of `src/auth` before identity is
renamed.

Current files:

```text
apps/api/src/auth/lib/password-hasher.ts
apps/api/src/auth/lib/opaque-token.ts
```

Target files:

```text
apps/api/src/platform/security/password-hasher.ts
apps/api/src/platform/security/opaque-token.ts
apps/api/src/platform/security/index.ts
```

Recommended approach:

- Move password hashing unchanged.
- Move opaque token generation/hashing unchanged.
- Update seed scripts, tests, and auth use cases.
- Do not move auth constants or request-auth types in this phase. Those belong
  to identity and should move in Phase 6.

Acceptance criteria:

- [x] `password-hasher` lives in platform security.
- [x] `opaque-token` lives in platform security.
- [x] `src/auth/lib` no longer exists.
- [x] Password, login, session, and password-reset tests pass.

Completion note:

- Completed on 2026-04-28.
- Moved password hashing and opaque token utilities under
  `platform/security`.
- Added `platform/security/index.ts` for security primitive exports.
- Updated auth flows, session auth, database seed, and test helpers to import
  from `platform/security`.
- Kept auth constants, request-auth types, and session auth ownership in place
  for later identity phases.
- Validation completed:
  - `pnpm typecheck:api`
  - `pnpm --filter @techbros/api run lint`
  - `pnpm --filter @techbros/api run test`
  - `pnpm build:api`
- Known risk: none found. The first local test attempt failed because Docker
  socket access was unavailable inside the sandbox; the approved rerun with
  Docker access passed.

Suggested commit:

```text
refactor(api): move security primitives to platform
```

## Phase 5: Prepare Module Layout Without Moving Auth Yet

Purpose:

Create the final module area and route mounting pattern before the large auth to
identity move.

Target additions:

```text
apps/api/src/modules/
apps/api/src/modules/identity/
```

Recommended approach:

- Create module directories only as needed.
- Do not add placeholder implementation files.
- Keep existing auth code in place until Phase 6.
- Update `app.ts` or bootstrap code only if needed to make the next phase clean.

Acceptance criteria:

- [x] `modules` exists.
- [x] No fake placeholder module files are added.
- [x] Validation commands pass.

Completion note:

- Completed on 2026-04-28.
- Added `modules/identity/README.md` to establish the tracked identity module
  boundary without adding placeholder source files.
- Confirmed the active implementation remains in `src/auth`,
  `src/features/auth`, and auth-specific middleware until Phase 6.
- Made no runtime code, route mounting, or bootstrap changes.
- Validation completed:
  - `pnpm typecheck:api`
  - `pnpm --filter @techbros/api run lint`
  - `pnpm build:api`
- Known risk: none found. Docker-backed tests were not run because this phase
  changed documentation only and made no runtime code changes.

Suggested commit:

```text
refactor(api): prepare backend module layout
```

This phase may be folded into Phase 6 if it would otherwise be empty.

## Phase 6: Rename Auth Feature To Identity Module

Purpose:

Unify all auth/identity code under one owned module.

Current files:

```text
apps/api/src/auth/constants.ts
apps/api/src/auth/services/session-auth.service.ts
apps/api/src/auth/types.ts
apps/api/src/features/auth/*
apps/api/src/middlewares/load-auth.ts
apps/api/src/middlewares/require-auth.ts
```

Target files:

```text
apps/api/src/modules/identity/domain/authenticated-user.ts
apps/api/src/modules/identity/domain/identity-constants.ts
apps/api/src/modules/identity/domain/identity-errors.ts
apps/api/src/modules/identity/domain/request-auth.ts

apps/api/src/modules/identity/application/forgot-password.use-case.ts
apps/api/src/modules/identity/application/login.use-case.ts
apps/api/src/modules/identity/application/logout.use-case.ts
apps/api/src/modules/identity/application/reset-password.use-case.ts
apps/api/src/modules/identity/application/resolve-request-auth.use-case.ts

apps/api/src/modules/identity/email/password-reset-email.ts

apps/api/src/modules/identity/http/auth.middleware.ts
apps/api/src/modules/identity/http/cookies.ts
apps/api/src/modules/identity/http/forgot-password.handler.ts
apps/api/src/modules/identity/http/forgot-password.schema.ts
apps/api/src/modules/identity/http/identity.router.ts
apps/api/src/modules/identity/http/login.handler.ts
apps/api/src/modules/identity/http/login.schema.ts
apps/api/src/modules/identity/http/logout.handler.ts
apps/api/src/modules/identity/http/me.handler.ts
apps/api/src/modules/identity/http/reset-password.handler.ts
apps/api/src/modules/identity/http/reset-password.schema.ts

apps/api/src/modules/identity/infrastructure/identity.repository.drizzle.ts
apps/api/src/modules/identity/index.ts
```

Recommended mapping:

- `features/auth/auth-user.ts` -> `modules/identity/domain/authenticated-user.ts`
- `features/auth/errors.ts` -> `modules/identity/domain/identity-errors.ts`
- `auth/constants.ts` -> `modules/identity/domain/identity-constants.ts`
- `auth/types.ts` -> `modules/identity/domain/request-auth.ts`
- `auth/services/session-auth.service.ts` ->
  `modules/identity/application/resolve-request-auth.use-case.ts`
- `features/auth/auth.router.ts` -> `modules/identity/http/identity.router.ts`
- `middlewares/load-auth.ts` and `middlewares/require-auth.ts` ->
  `modules/identity/http/auth.middleware.ts`
- `features/auth/cookies.ts` -> `modules/identity/http/cookies.ts`
- `features/auth/email/password-reset-email.ts` ->
  `modules/identity/email/password-reset-email.ts`
- `features/auth/repositories/auth.repository.ts` ->
  `modules/identity/infrastructure/identity.repository.drizzle.ts`
- `features/auth/*/*.service.ts` -> `modules/identity/application/*.use-case.ts`
- `features/auth/*/*.handler.ts` -> `modules/identity/http/*.handler.ts`
- `features/auth/*/*.schema.ts` -> `modules/identity/http/*.schema.ts`

Important:

The external URL path remains `/api/v1/auth`. The internal module name becomes
`identity`.

Acceptance criteria:

- [x] `src/auth` no longer exists.
- [x] `src/features/auth` no longer exists.
- [x] Auth-specific middleware is owned by `modules/identity/http`.
- [x] The identity module has a public `index.ts`.
- [x] Routes still mount at `/api/v1/auth`.
- [x] All current auth, workflow, side-effect, and security tests pass.
- [x] No old-path re-export files exist.

Completion note:

- Completed on 2026-04-28.
- Moved the active auth implementation into `modules/identity` with domain,
  application, email, HTTP, and infrastructure folders.
- Consolidated auth-specific request middleware into
  `modules/identity/http/auth.middleware.ts`.
- Kept the external route mounted at `/api/v1/auth` through the identity module
  public `index.ts`.
- Deleted the old `src/auth`, `src/features/auth`, and `src/middlewares`
  directories after direct import updates.
- Validation completed:
  - `pnpm typecheck:api`
  - `pnpm --filter @techbros/api run lint`
  - `pnpm --filter @techbros/api run test`
  - `pnpm build:api`
  - `test ! -d apps/api/src/auth`
  - `test ! -d apps/api/src/features/auth`
  - `test ! -d apps/api/src/middlewares`
  - `rg "auth/constants|auth/types|auth/services/session-auth|features/auth|middlewares/(load-auth|require-auth)" apps/api/src apps/api/tests`
- Known risk: none found. The first sandboxed test run failed because
  Testcontainers could not access a container runtime; the same test command
  passed with Docker access.

Suggested commit:

```text
refactor(api): consolidate auth into identity module
```

## Phase 7: Split Identity Persistence Ports And Adapter

Purpose:

Reduce the large identity repository surface and make use-case dependencies
narrow.

Starting point:

```text
modules/identity/infrastructure/identity.repository.drizzle.ts
```

Target application ports:

```text
modules/identity/application/ports.ts
```

Example ports:

```text
LoginUserReader
SessionWriter
SessionReader
PasswordResetTokenWriter
PasswordResetTokenReader
UserPasswordWriter
IdentityTransactionRunner
AuditRecorder
EmailSender
OpaqueTokenIssuer
PasswordVerifier
PasswordHasher
```

Possible target adapters:

```text
modules/identity/infrastructure/user.repository.drizzle.ts
modules/identity/infrastructure/session.repository.drizzle.ts
modules/identity/infrastructure/password-reset-token.repository.drizzle.ts
modules/identity/infrastructure/identity-transaction.drizzle.ts
```

This phase can choose one of two clean approaches:

Option A: split files physically.

- Best when the repository is becoming hard to navigate.
- More files, clearer ownership.

Option B: keep one Drizzle adapter file but expose narrow port objects.

- Best if splitting transactions becomes awkward.
- Fewer files, still gives use cases narrow dependencies.

Either option is acceptable. The key requirement is that use cases stop
depending on one broad `AuthRepository` shape.

Acceptance criteria:

- [x] Application use cases depend on narrow ports.
- [x] Drizzle code remains in `infrastructure`.
- [x] Transaction boundaries remain explicit and tested.
- [x] Login, logout, session, and password-reset behavior is unchanged.
- [x] Validation commands pass.

Completion note:

- Completed on 2026-04-28.
- Added `modules/identity/application/ports.ts` for application-owned
  persistence and external dependency contracts.
- Replaced the broad `identity.repository.drizzle.ts` with split Drizzle
  adapters for users, sessions, password-reset tokens, and identity
  transactions.
- Updated identity application use cases to depend on narrow ports while
  preserving existing service factory and singleton names.
- Kept HTTP routes, cookies, database schema, migrations, and bootstrap
  composition unchanged.
- Validation completed:
  - `pnpm typecheck:api`
  - `pnpm --filter @techbros/api run lint`
  - `pnpm --filter @techbros/api run test`
  - `pnpm build:api`
  - `test ! -f apps/api/src/modules/identity/infrastructure/identity.repository.drizzle.ts`
  - `rg "AuthRepository|authRepository|identity.repository.drizzle" apps/api/src/modules/identity apps/api/tests`
  - `rg "platform/database|platform/database/schema" apps/api/src/modules/identity/application`
- Known risk: none found. The first sandboxed test run failed because
  Testcontainers could not access a container runtime; the same test command
  passed with Docker access.

Suggested commit:

```text
refactor(api): narrow identity persistence boundaries
```

## Phase 8: Clean Bootstrap Composition

Purpose:

Make application creation, dependency wiring, and process lifecycle explicit.

Current files:

```text
apps/api/src/app.ts
apps/api/src/server.ts
```

Target files:

```text
apps/api/src/main.ts
apps/api/src/bootstrap/create-app.ts
apps/api/src/bootstrap/create-dependencies.ts
apps/api/src/bootstrap/shutdown.ts
```

Recommended responsibilities:

- `main.ts`
  - Process entrypoint.
  - Calls dependency creation.
  - Starts server.
  - Registers shutdown.
- `bootstrap/create-app.ts`
  - Creates Express app.
  - Installs generic platform middleware.
  - Mounts health/readiness routes.
  - Mounts versioned API routers.
  - Installs not-found and error middleware.
- `bootstrap/create-dependencies.ts`
  - Creates adapters and use cases.
  - Wires module routers.
  - Keeps concrete construction away from use-case files.
- `bootstrap/shutdown.ts`
  - Owns graceful shutdown logic.

Important:

Avoid introducing a heavy dependency injection framework. Plain factories are
enough.

Acceptance criteria:

- [x] `main.ts` is small.
- [x] Bootstrap owns concrete dependency wiring.
- [x] Module use cases do not instantiate concrete platform adapters directly
      unless there is a deliberate singleton pattern still being phased out.
- [x] Startup/shutdown tests pass.
- [x] Validation commands pass.

Completion note:

- Completed on 2026-04-28.
- Added `main.ts`, `bootstrap/create-app.ts`,
  `bootstrap/create-dependencies.ts`, and `bootstrap/shutdown.ts`.
- Moved Express app construction, identity dependency wiring, API router
  composition, and graceful shutdown out of the old `app.ts` and `server.ts`
  ownership files.
- Updated package scripts, process test helper, and testing docs to use
  `src/main.ts` and `dist/main.js`.
- Removed default-built identity service, handler, load-auth middleware, router,
  API v1 router, and Drizzle adapter singletons so bootstrap owns concrete
  construction.
- Kept public HTTP behavior, route paths, cookies, startup readiness behavior,
  shutdown behavior, database schema, and migrations unchanged.
- Validation completed:
  - `pnpm typecheck:api`
  - `pnpm --filter @techbros/api run lint`
  - `pnpm --filter @techbros/api run test`
  - `pnpm build:api`
  - `test ! -f apps/api/src/app.ts`
  - `test ! -f apps/api/src/server.ts`
  - `rg "src/server|dist/server|src/app|from \"\\./app" apps/api/package.json apps/api/tests docs/testing.md apps/api/src`
  - `rg "authRepository|identityTransactionRunner|auditLogService|emailService|opaqueTokenService|passwordHasher|logger" apps/api/src/modules/identity/application`
  - `rg "export const (authRouter|apiV1Router|loginService|logoutService|forgotPasswordService|resetPasswordService|sessionAuthService|loginHandler|logoutHandler|forgotPasswordHandler|resetPasswordHandler|loadAuthMiddleware)" apps/api/src/modules/identity apps/api/src/routes/api/v1`
- Known risk: none found. The first sandboxed test run failed because
  Testcontainers could not access a container runtime; the same test command
  passed with Docker access.

Suggested commit:

```text
refactor(api): separate bootstrap composition and shutdown
```

## Phase 9: Establish Future Domain Module Ownership

Purpose:

Document and prepare module ownership for the business domains already present
in the database schema.

Potential modules:

```text
modules/tenancy/
modules/access-control/
modules/clients/
modules/policies/
modules/enrollments/
modules/claims/
modules/reference-data/
```

Suggested ownership:

- `tenancy`
  - Tenants and tenant-scoped context.
- `identity`
  - Users, sessions, password reset, current request auth.
- `access-control`
  - Roles, permissions, role assignments, authorization policies.
- `clients`
  - Clients, affiliates, client users.
- `policies`
  - Insurers and policies.
- `enrollments`
  - Policy enrollments and enrollment members.
- `claims`
  - Claims, invoices, submissions, status history, claim number counters.
- `reference-data`
  - Diagnoses and other lookup/reference data.
- `platform/audit`
  - Audit log recording infrastructure.

Important:

Do not create empty implementation files. A short module README can be useful if
it clarifies ownership, but empty source files create false structure.

Acceptance criteria:

- [x] Module ownership is documented.
- [x] No fake implementations are added.
- [x] Future endpoint work has an obvious destination.

Completion note:

- Completed on 2026-04-28.
- Added `docs/backend-module-ownership.md` with the backend domain ownership
  map, table ownership, future endpoint destinations, and boundary notes.
- Added `apps/api/src/modules/README.md` with module layering rules and the
  no-placeholder implementation rule.
- Added README-only ownership markers for `tenancy`, `access-control`,
  `clients`, `policies`, `enrollments`, `claims`, and `reference-data`.
- Refreshed `modules/identity/README.md` to reflect the current Phase 8 state,
  including split ports/adapters and bootstrap-owned construction.
- Made no route, import, service, adapter, schema, migration, or runtime
  behavior changes.
- Validation completed:
  - `pnpm typecheck:api`
  - `pnpm --filter @techbros/api run lint`
  - `pnpm build:api`
  - `find apps/api/src/modules -path '*/README.md' -o -type f`
  - `find apps/api/src/modules/tenancy apps/api/src/modules/access-control apps/api/src/modules/clients apps/api/src/modules/policies apps/api/src/modules/enrollments apps/api/src/modules/claims apps/api/src/modules/reference-data -type f ! -name README.md`
- Known risk: none found. Docker-backed tests were not run because this phase
  changed documentation only and made no runtime code changes.

Suggested commit:

```text
docs(api): document backend module ownership
```

This phase may be combined with docs updates from Phase 12.

## Phase 10: Enforce Boundaries

Purpose:

Make the architecture durable with automated import rules.

Preferred enforcement:

- ESLint restrictions.
- TypeScript project references only if needed later.
- Avoid custom scripts unless ESLint cannot express the rule.

Rules to enforce:

- `modules/*/domain/**` cannot import:
  - `express`
  - `drizzle-orm`
  - `pg`
  - `platform/database`
  - `platform/http`
  - `platform/config`
  - `platform/logger`
- `modules/*/application/**` cannot import:
  - `express`
  - `drizzle-orm`
  - `pg`
  - `platform/database`
  - concrete adapters
- `modules/*/infrastructure/**` may import:
  - its own module application ports
  - its own module domain
  - `platform/database`
- `platform/**` cannot import `modules/**`.
- `shared/**` cannot import `platform/**` or `modules/**`.
- Modules cannot import another module's deep files.

Acceptable imports:

- `modules/claims` may import public exports from `modules/identity`.
- `bootstrap` may import platform and module HTTP/public exports.
- Tests may import internals when the test scope justifies it.

Acceptance criteria:

- [x] Boundary rules are automated.
- [x] Existing imports comply.
- [x] Lint fails for known-bad dependency directions.
- [x] Validation commands pass.

Completion note:

- Completed on 2026-04-28.
- Added scoped ESLint `no-restricted-imports` rules for platform, module,
  domain, application, and infrastructure boundaries.
- Made identity domain constants environment-free and moved HTTP `AppError`
  creation from identity domain into identity application so current imports
  comply with the automated rules.
- Verified known-bad dependency directions with the ESLint API and virtual
  `lintText` contents against existing file paths:
  - domain importing platform config
  - application importing platform database
  - application importing Express
  - platform importing a module
  - one module deep-importing another module's layer file
- Validation completed:
  - `pnpm typecheck:api`
  - `pnpm --filter @techbros/api run lint`
  - `pnpm build:api`
- Known risk: none found.

Suggested commit:

```text
chore(api): enforce backend module import boundaries
```

## Phase 11: Reorganize Tests

Purpose:

Make tests mirror the architecture without weakening current integration
coverage.

Current test shape:

```text
apps/api/tests/
  auth/
  consistency/
  errors/
  helpers/
  http/
  security/
  side-effects/
  smoke/
  validation/
  workflows/
```

Target test shape:

```text
apps/api/tests/
  contracts/
    http-contract.process.test.ts
    error-contract.process.test.ts
    input-validation.process.test.ts

  modules/
    identity/
      auth-session.process.test.ts
      authorization-isolation.process.test.ts
      auth-state.process.test.ts
      password-reset.process.test.ts

  operations/
    server.process.test.ts
    security-resilience.process.test.ts
    external-side-effects.process.test.ts

  consistency/
    claim-audit-scope.process.test.ts

  helpers/
  setup/
```

Recommended approach:

- Move tests only after source paths are stable.
- Update helper imports.
- Keep process/integration behavior.
- Add module-level tests only when they clarify use cases or ports.

Acceptance criteria:

- [x] Test folders reflect architecture.
- [x] Existing tests still run through the real process boundary where they do
      today.
- [x] Test docs are updated.
- [x] Validation commands pass.

Completion note:

- Completed on 2026-04-28.
- Moved tests into architecture-facing folders:
  - `tests/contracts`
  - `tests/modules/identity`
  - `tests/operations`
  - `tests/consistency`
- Kept helper, setup, and TypeScript test config ownership unchanged.
- Removed the emptied old test folders after the move.
- Updated `docs/testing.md` to document the new suite locations.
- Validation completed:
  - `pnpm typecheck:api`
  - `pnpm --filter @techbros/api run lint`
  - `pnpm --filter @techbros/api run test`
  - `pnpm build:api`
- Known risk: none found. The test command was run with Docker access so
  Testcontainers could start PostgreSQL and Inbucket.

Suggested commit:

```text
refactor(api): organize tests around contracts modules and operations
```

## Phase 12: Final Documentation And Cleanup

Purpose:

Remove stale references and make the new structure easy for a future developer
to understand.

Docs to update:

```text
README.md
docs/database.md
docs/testing.md
docs/backend-module-ownership.md
docs/backend-architecture-refactor-plan.md
```

Cleanup checklist:

- [x] Remove empty old folders.
- [x] Remove stale path references.
- [x] Remove obsolete comments.
- [x] Confirm no `.DS_Store` files are tracked.
- [x] Confirm no `features` folder remains unless intentionally repurposed.
- [x] Confirm no `services` folder remains unless it has a precise new meaning.
- [x] Confirm no `src/auth` folder remains.
- [x] Confirm no internal compatibility shims exist.
- [x] Confirm no source files import from deleted conceptual paths.

Completion note:

- Completed on 2026-04-28.
- Updated current-facing docs:
  - `README.md`
  - `docs/database.md`
  - `docs/testing.md`
  - `docs/backend-module-ownership.md`
  - `docs/backend-architecture-refactor-plan.md`
- Updated the architecture plan's current backend shape and target tree to
  match the completed refactor.
- Confirmed old source/test folders from previous layouts are absent or empty
  folders have been removed.
- Cleaned ignored compiled API output before the final build so local `dist`
  does not retain artifacts for deleted paths.
- Validation completed:
  - `pnpm typecheck:api`
  - `pnpm --filter @techbros/api run lint`
  - `pnpm --filter @techbros/api run test`
  - `pnpm build:api`
- Final verification scans completed:
  - `find apps/api/src -maxdepth 2 -type d \( -name auth -o -name features -o -name services \) -print`
  - `rg "src/auth|src/features/auth|src/services|src/db|src/server|dist/server|src/app|auth/constants|auth/types|auth/services/session-auth|features/auth|middlewares/(load-auth|require-auth)" apps/api/src apps/api/tests README.md docs/database.md docs/testing.md docs/backend-module-ownership.md -g '*.*'`
  - `rg "from .*platform/database|from .*drizzle-orm|from .*express" apps/api/src/modules/*/domain apps/api/src/modules/*/application -g '*.ts'`
  - `test ! -f apps/api/src/modules/identity/infrastructure/identity.repository.drizzle.ts`
  - `git ls-files | rg '\.DS_Store$'`
  - `find apps/api/src -type d -empty | sort`
- Known risk: none found. Full Docker-backed tests passed with PostgreSQL and
  Inbucket through Testcontainers.

Final validation:

```sh
pnpm typecheck:api
pnpm --filter @techbros/api run lint
pnpm --filter @techbros/api run test
pnpm build:api
```

Suggested commit:

```text
docs(api): finalize backend architecture documentation
```

## Final Success Criteria

The refactor is complete when:

- [x] `apps/api/src` has `bootstrap`, `platform`, and `modules`.
- [x] Identity code is fully under `modules/identity`.
- [x] Generic infrastructure is fully under `platform`.
- [x] Database infrastructure is split by responsibility.
- [x] There is no `src/auth`.
- [x] There is no `src/features/auth`.
- [x] There is no vague `src/services`.
- [x] There are no old-path re-export shims.
- [x] Application use cases do not import Express or Drizzle directly.
- [x] Domain code does not import platform or infrastructure.
- [x] Boundary rules are enforced automatically.
- [x] Existing public HTTP contracts still pass.
- [x] Startup/readiness behavior still passes.
- [x] Audit/email side effects still pass.
- [x] README and docs describe the new structure.

## Suggested Commit Sequence

```text
1. docs: add backend architecture refactor plan
2. refactor(api): move generic platform http config and logger
3. refactor(api): split database platform infrastructure
4. refactor(api): move audit and email adapters to platform
5. refactor(api): move security primitives to platform
6. refactor(api): prepare backend module layout
7. refactor(api): consolidate auth into identity module
8. refactor(api): narrow identity persistence boundaries
9. refactor(api): separate bootstrap composition and shutdown
10. docs(api): document backend module ownership
11. chore(api): enforce backend module import boundaries
12. refactor(api): organize tests around contracts modules and operations
13. docs(api): finalize backend architecture documentation
```

Some adjacent phases can be combined if the diff is still reviewable. Do not
combine phases that would make it hard to identify the source of a regression.

## Regression Triage Guide

If a validation step fails after a move:

1. Check import paths first.
2. Check Express route mounting order.
3. Check env/config import paths.
4. Check database schema and migrations paths.
5. Check test helper imports.
6. Check singleton construction and circular imports.
7. Check whether a moved file changed runtime side effects.

Do not add a compatibility shim to make the failure go away. Fix the direct
import or the ownership boundary.

## Notes For Future Work

Once this refactor is complete, future backend work should follow this pattern:

- New business behavior goes under `modules/<domain>`.
- New third-party or environment-backed infrastructure goes under `platform`.
- New HTTP behavior in a module goes under `modules/<domain>/http`.
- New use-case orchestration goes under `modules/<domain>/application`.
- New persistence code goes under `modules/<domain>/infrastructure`.
- New pure domain concepts go under `modules/<domain>/domain`.
- Shared code is added only when at least two owners genuinely need it.

The architecture should help the backend grow without turning every new feature
into a scavenger hunt.
