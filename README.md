# Techbros Workspace

Minimal `pnpm` workspace for the Techbros backend platform. The active app is
[`apps/api`](./apps/api), an Express + TypeScript REST API. [`apps/web`](./apps/web)
and [`packages/shared`](./packages/shared) exist as placeholders and are not active yet.

## Prerequisites

- Node `24.13.0`
- pnpm `10`
- Docker

## Local Setup

```sh
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm --filter @techbros/api run db:up
pnpm --filter @techbros/api run db:migrate
pnpm dev
```

The API listens on port `3000` by default.

`apps/api/.env.example` includes the optional runtime settings for:

- `CORS_ALLOWED_ORIGINS` for credentialed browser CORS allowlisting
- `LOG_LEVEL` for overriding the default `debug`/`info` environment behavior
- `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, and `PG_CONNECT_TIMEOUT_MS` for pool sizing and fail-fast connectivity

## Commands

Run these from the repo root.

| Command             | Purpose                                  |
| ------------------- | ---------------------------------------- |
| `pnpm dev`          | Start the API in watch mode              |
| `pnpm build`        | Compile the API to `dist/`               |
| `pnpm start`        | Run the compiled API                     |
| `pnpm typecheck`    | Run the API TypeScript check             |
| `pnpm lint`         | Run ESLint for `apps/api`                |
| `pnpm format`       | Format the repo with Prettier            |
| `pnpm format:check` | Check formatting without rewriting files |
| `pnpm test`         | Run the API test suite                   |

## Repo Structure

- [`apps/api`](./apps/api): active Express API
- [`apps/web`](./apps/web): reserved for a future web app
- [`packages/shared`](./packages/shared): reserved for future shared packages

## Operational Endpoints

- `GET /health`: liveness check, returns `200` with `{ "status": "ok" }`
- `GET /ready`: readiness check, returns `200` when PostgreSQL is reachable and
  `503` when it is not

## Runtime Defaults

- JSON request bodies are limited to `1mb`; larger payloads return `413` with
  the standard error envelope
- In `development` and `test`, the API allows credentialed browser origins from
  `localhost`/`127.0.0.1` on ports `3000`, `5173`, and `4173` when
  `CORS_ALLOWED_ORIGINS` is not set
- In `production`, `CORS_ALLOWED_ORIGINS` must be configured explicitly
- Database startup and readiness checks use a `5s` connection timeout by default

## Public API Seed

- `GET /api/v1/status`: versioned API seed endpoint, returns `200` with
  `{ "status": "ok" }`

## More Docs

- [Database workflow](./docs/database.md)
- [Testing workflow](./docs/testing.md)
