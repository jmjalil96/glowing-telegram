# Access Control Module

This module owns authorization data and role/permission assignment behavior.

Owned schema tables:

- `roles`
- `permissions`
- `user_roles`
- `role_permissions`

Likely future API work:

- role management
- permission management
- user role assignment
- authorization policy checks that go beyond request authentication

Non-ownership boundaries:

- user identity, sessions, and password reset belong to `identity`
- tenant lifecycle belongs to `tenancy`
- request auth middleware belongs to `identity/http`

This module is currently documentation-only. Do not add source files here until
there is real access-control behavior to implement.
