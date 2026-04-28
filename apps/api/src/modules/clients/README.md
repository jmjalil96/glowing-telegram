# Clients Module

This module owns client administration and related client people/entities.

Owned schema tables:

- `clients`
- `client_users`
- `affiliates`

Likely future API work:

- client CRUD
- client user management
- affiliate management

Non-ownership boundaries:

- policies and insurers belong to `policies`
- policy enrollments and enrollment members belong to `enrollments`
- claims belong to `claims`

This module is currently documentation-only. Do not add source files here until
there is real client behavior to implement.
