# Identity Module

This module owns identity and authentication behavior for the API.

It owns:

- users and authenticated user mapping
- sessions and request authentication resolution
- password reset flows and reset-token persistence
- authentication HTTP routes and handlers
- authentication cookies and auth-specific middleware
- identity application ports and persistence adapters

The external HTTP route remains `/api/v1/auth`; the internal ownership boundary
is `modules/identity`.

Runtime dependency construction is owned by `bootstrap/create-dependencies.ts`.
Identity use cases define ports and do not construct concrete platform or
database adapters directly.

Owned schema tables:

- `users`
- `sessions`
- `user_tokens`

Related but not owned:

- `tenants` belongs to `tenancy`
- `roles`, `permissions`, `user_roles`, and `role_permissions` belong to
  `access-control`
