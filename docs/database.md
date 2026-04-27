# Database Workflow

The API uses PostgreSQL `17` in Docker Compose, `pg` for connectivity, and
Drizzle for schema and migrations. The same Docker Compose stack also includes
Inbucket for local SMTP testing.

## Local Postgres Contract

`docker-compose.yml` defines the local persistence and mail-testing services:

- service: `postgres`
- database: `techbros_api`
- user: `postgres`
- password: `postgres`
- port: `5432`
- service: `inbucket`
- SMTP port: `2500`
- web UI: `http://localhost:9000`

The API reads its database connection from `apps/api/.env` through
`DATABASE_URL`.

Example:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/techbros_api
```

## Current Layout

- `apps/api/drizzle.config.ts`: Drizzle Kit config
- `apps/api/src/db/schema`: schema source files
- `apps/api/src/db/migrations`: generated SQL migrations
- `apps/api/src/db/migrate.ts`: explicit migration runner

The current schema covers the core API domain:

- tenancy and authentication: tenants, users, sessions, user tokens
- authorization: roles, permissions, user roles, role permissions
- client administration: clients, client users, affiliates
- policy administration: insurers, policies, policy enrollments, enrollment
  members
- claims: claims, tenant-scoped claim number counters, claim invoices, claim
  submissions, claim status history, submission status history
- reference and operations data: diagnoses, audit logs

Tenant-owned domain rows carry `tenant_id` and use tenant-scoped foreign keys
where cross-tenant leakage would be risky. Claims, claim submissions, claim
history, submission history, and claim invoices all link back to their parent
records with composite tenant-scoped constraints.

Claim numbers are tenant-scoped internal identifiers. Insurer-provided claim
references should be stored separately on `claims.insurer_claim_number`, because
external numbers can repeat across tenants, clients, or insurers.

## Commands

Run these from the repo root.

```sh
pnpm --filter @techbros/api run db:up
pnpm --filter @techbros/api run db:down
pnpm --filter @techbros/api run db:generate
pnpm --filter @techbros/api run db:migrate
pnpm --filter @techbros/api run db:seed
pnpm --filter @techbros/api run db:studio
```

## Normal Flow

Start PostgreSQL and Inbucket:

```sh
pnpm --filter @techbros/api run db:up
```

Apply existing migrations:

```sh
pnpm --filter @techbros/api run db:migrate
```

Generate a new migration after changing schema files:

```sh
pnpm --filter @techbros/api run db:generate
```

Then apply it explicitly:

```sh
pnpm --filter @techbros/api run db:migrate
```

Seed local development data when needed:

```sh
pnpm --filter @techbros/api run db:seed
```

Open Drizzle Studio when needed:

```sh
pnpm --filter @techbros/api run db:studio
```

Stop the local Docker services:

```sh
pnpm --filter @techbros/api run db:down
```

## Current Rules

- Migrations are explicit and manual.
- The API does not auto-run migrations on startup.
- Startup requires PostgreSQL to be reachable and the latest applied Drizzle
  migration version to exactly match the app's migration journal before the
  server begins listening.
- Readiness uses the same connectivity and migration-version check, so `/ready`
  reports unhealthy for unreachable databases, missing migration state, or any
  schema version mismatch.
- Use `pnpm --filter @techbros/api run db:generate` after schema changes. A
  clean run reports `No schema changes, nothing to migrate`.
- Use `pnpm --filter @techbros/api exec drizzle-kit check --config=drizzle.config.ts`
  to validate migration metadata and ordering.
- After new migrations are added, run `pnpm --filter @techbros/api run db:migrate`
  against the configured local database so readiness matches the migration
  journal.
- Startup and readiness use fail-fast database connection timeouts. Tune them
  with:
  - `PG_POOL_MAX` default `10`
  - `PG_IDLE_TIMEOUT_MS` default `30000`
  - `PG_CONNECT_TIMEOUT_MS` default `5000`
- If PostgreSQL is reachable but the HTTP port is unavailable, startup exits
  cleanly after logging the bind failure.
