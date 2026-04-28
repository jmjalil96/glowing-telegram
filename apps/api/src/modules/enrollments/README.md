# Enrollments Module

This module owns policy enrollment and enrolled member behavior.

Owned schema tables:

- `policy_enrollments`
- `policy_enrollment_members`

Likely future API work:

- policy enrollment management
- enrollment member management
- enrollment eligibility and date-range workflows

Non-ownership boundaries:

- policy definitions belong to `policies`
- clients and affiliates belong to `clients`
- claims filed by enrollment members belong to `claims`

This module is currently documentation-only. Do not add source files here until
there is real enrollment behavior to implement.
