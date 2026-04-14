# Techbros Workspace

Minimal `pnpm` workspace for the Techbros platform. The active apps are
[`apps/api`](./apps/api), an Express + TypeScript REST API, and
[`apps/web`](./apps/web), a React + TypeScript Vite frontend. [`packages/shared`](./packages/shared)
remains reserved for future shared packages.

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

`pnpm dev` starts both apps. The API listens on port `3000` by default, and the
web app listens on port `5173`.

`pnpm --filter @techbros/api run db:up` also starts Inbucket for local email
testing. The SMTP listener is available at `127.0.0.1:2500`, and the Inbucket
web UI is available at `http://localhost:9000`.

In local development, the Vite dev server proxies `/api`, `/health`, and
`/ready` from the web origin to the API. When `pnpm dev` is running, the web
app can call `/api/v1/status`, `/health`, and `/ready` through
`http://localhost:5173`.

`apps/api/.env.example` includes the optional runtime settings for:

- `CORS_ALLOWED_ORIGINS` for credentialed browser CORS allowlisting
- `WEB_APP_URL` for frontend-facing auth URLs such as password reset links
- `LOG_LEVEL` for overriding the default `debug`/`info` environment behavior
- `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, and `PG_CONNECT_TIMEOUT_MS` for pool sizing and fail-fast connectivity
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`,
  `EMAIL_FROM`, and `EMAIL_REPLY_TO` for SMTP delivery

If `SMTP_HOST` is left unset in `development` or `test`, the API defaults to
Inbucket on `127.0.0.1:2500` and uses `no-reply@techbros.local` as the default
sender address.

If `WEB_APP_URL` is left unset in `development` or `test`, the API defaults to
`http://localhost:5173`. In `production`, it must be configured explicitly.

## Commands

Run these from the repo root.

| Command              | Purpose                                   |
| -------------------- | ----------------------------------------- |
| `pnpm dev`           | Start the API and web app together        |
| `pnpm dev:api`       | Start only the API in watch mode          |
| `pnpm dev:web`       | Start only the web app in dev mode        |
| `pnpm build`         | Build both active apps                    |
| `pnpm build:api`     | Compile the API to `dist/`                |
| `pnpm build:web`     | Build the web app for production          |
| `pnpm start`         | Run the compiled API                      |
| `pnpm typecheck`     | Run TypeScript checks for both apps       |
| `pnpm typecheck:api` | Run the API TypeScript check              |
| `pnpm typecheck:web` | Run the web app TypeScript check          |
| `pnpm lint`          | Run ESLint for both active apps           |
| `pnpm lint:fix`      | Run ESLint autofixes for both active apps |
| `pnpm preview:web`   | Preview the web production build          |
| `pnpm format`        | Format the repo with Prettier             |
| `pnpm format:check`  | Check formatting without rewriting files  |
| `pnpm test`          | Run the API test suite                    |

## Repo Structure

- [`apps/api`](./apps/api): active Express API
- [`apps/web`](./apps/web): active React + Vite web app
- [`packages/shared`](./packages/shared): reserved for future shared packages

## Operational Endpoints

- `GET /health`: liveness check, returns `200` with `{ "status": "ok" }`
- `GET /ready`: readiness check, returns `200` when PostgreSQL is reachable and
  the latest applied Drizzle migration version exactly matches the app's
  expected version; returns `503` otherwise

## Runtime Defaults

- JSON request bodies are limited to `1mb`; larger payloads return `413` with
  the standard error envelope
- In `development` and `test`, the API allows credentialed browser origins from
  `localhost`/`127.0.0.1` on ports `3000`, `5173`, and `4173` when
  `CORS_ALLOWED_ORIGINS` is not set
- In `production`, `CORS_ALLOWED_ORIGINS` must be configured explicitly
- Database startup and readiness checks use a `5s` connection timeout by default
  and require the expected Drizzle migration version

## Public API Seed

- `GET /api/v1/status`: versioned API seed endpoint, returns `200` with
  `{ "status": "ok" }`

## More Docs

- [Database workflow](./docs/database.md)
- [Testing workflow](./docs/testing.md)
