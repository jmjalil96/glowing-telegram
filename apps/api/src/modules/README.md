# Backend Modules

This directory contains business-domain modules.

Use these layers when a module needs them:

- `http`: route, handler, schema, cookie, and module-owned middleware code.
- `application`: use cases, orchestration, ports, and transaction boundaries.
- `domain`: pure domain types, constants, rules, and errors.
- `infrastructure`: concrete adapters for persistence and external systems.

Do not add empty source files, `.gitkeep` files, or placeholder implementations.
A module directory should be tracked by a README until there is real runtime
code to add.

Current active runtime module:

- `identity`

README-only ownership markers:

- `tenancy`
- `access-control`
- `clients`
- `policies`
- `enrollments`
- `claims`
- `reference-data`

See `docs/backend-module-ownership.md` for the ownership map.
