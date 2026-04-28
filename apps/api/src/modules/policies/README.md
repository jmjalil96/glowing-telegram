# Policies Module

This module owns insurers and policy definitions.

Owned schema tables:

- `insurers`
- `policies`

Likely future API work:

- insurer management
- policy CRUD
- policy date and coverage metadata workflows

Non-ownership boundaries:

- clients and affiliates belong to `clients`
- policy enrollments and enrollment members belong to `enrollments`
- claims against policies belong to `claims`

This module is currently documentation-only. Do not add source files here until
there is real policy behavior to implement.
