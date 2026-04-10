# Database Workflow

The API uses PostgreSQL `17` in Docker Compose, `pg` for connectivity, and
Drizzle for schema and migrations.

## Local Postgres Contract

`docker-compose.yml` defines a single database service:

- service: `postgres`
- database: `techbros_api`
- user: `postgres`
- password: `postgres`
- port: `5432`

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

The current schema includes the `users` table.

## Commands

Run these from the repo root.

```sh
pnpm --filter @techbros/api run db:up
pnpm --filter @techbros/api run db:down
pnpm --filter @techbros/api run db:generate
pnpm --filter @techbros/api run db:migrate
pnpm --filter @techbros/api run db:studio
```

## Normal Flow

Start PostgreSQL:

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

Open Drizzle Studio when needed:

```sh
pnpm --filter @techbros/api run db:studio
```

Stop PostgreSQL:

```sh
pnpm --filter @techbros/api run db:down
```

## Current Rules

- Migrations are explicit and manual.
- The API does not auto-run migrations on startup.
- Startup requires PostgreSQL to be reachable before the server begins
  listening.
- Startup and readiness use fail-fast database connection timeouts. Tune them
  with:
  - `PG_POOL_MAX` default `10`
  - `PG_IDLE_TIMEOUT_MS` default `30000`
  - `PG_CONNECT_TIMEOUT_MS` default `5000`
- If PostgreSQL is reachable but the HTTP port is unavailable, startup exits
  cleanly after logging the bind failure.
