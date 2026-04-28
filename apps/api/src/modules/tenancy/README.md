# Tenancy Module

This module owns tenants and tenant-scoped context.

Owned schema tables:

- `tenants`

Likely future API work:

- tenant administration
- tenant settings
- tenant-scoped context helpers for business workflows

Non-ownership boundaries:

- request authentication belongs to `identity`
- roles and permissions belong to `access-control`
- audit recording infrastructure belongs to `platform/audit`

This module is currently documentation-only. Do not add source files here until
there is real tenancy behavior to implement.
