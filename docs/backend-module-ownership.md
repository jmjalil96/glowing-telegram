# Backend Module Ownership

This document maps backend business ownership to module destinations. New
business behavior should live under `apps/api/src/modules/<domain>` and use the
standard module layers only when they are needed:

- `http`: routers, handlers, request schemas, cookies, and module-owned
  middleware.
- `application`: use cases, orchestration, ports, and transaction boundaries.
- `domain`: pure domain types, constants, rules, and errors.
- `infrastructure`: concrete adapters for persistence and other external
  systems.

Do not add empty source files or `.gitkeep` files to imply future structure.
README files are acceptable when they document real ownership decisions.

## Modules

| Module           | Purpose                                                                  | Owned Tables                                                                                                                 | Future Endpoint Destination                                                                | Boundary Notes                                                                                                           |
| ---------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `tenancy`        | Tenants and tenant-scoped context.                                       | `tenants`                                                                                                                    | Tenant administration and tenant context endpoints.                                        | Request authentication remains in `identity`; audit recording remains in `platform/audit`.                               |
| `identity`       | Users, sessions, password reset, current request auth.                   | `users`, `sessions`, `user_tokens`                                                                                           | Current route: `/api/v1/auth`. Future identity routes stay under this module.              | Authorization roles belong to `access-control`; tenant lifecycle belongs to `tenancy`.                                   |
| `access-control` | Roles, permissions, role assignments, and authorization policy behavior. | `roles`, `permissions`, `user_roles`, `role_permissions`                                                                     | Role, permission, and assignment endpoints.                                                | User account lifecycle stays in `identity`; request-level auth middleware stays in `identity/http`.                      |
| `clients`        | Client accounts, client users, and affiliates.                           | `clients`, `client_users`, `affiliates`                                                                                      | Client, affiliate, and client-user endpoints.                                              | Policy contracts belong to `policies`; enrollment membership belongs to `enrollments`.                                   |
| `policies`       | Insurers and insurance policies.                                         | `insurers`, `policies`                                                                                                       | Insurer and policy endpoints.                                                              | Policy enrollment records belong to `enrollments`; claim processing belongs to `claims`.                                 |
| `enrollments`    | Policy enrollments and enrollment members.                               | `policy_enrollments`, `policy_enrollment_members`                                                                            | Enrollment and enrollment-member endpoints.                                                | Policy definitions stay in `policies`; claims against members stay in `claims`.                                          |
| `claims`         | Claims, claim numbers, invoices, submissions, and status histories.      | `claim_number_counters`, `claims`, `claim_status_history`, `claim_invoices`, `claim_submissions`, `claim_submission_history` | Claim, invoice, submission, and claim-status endpoints.                                    | Diagnosis lookup belongs to `reference-data`; identity may be used for current-user context only through public exports. |
| `reference-data` | Lookup/reference data used by other modules.                             | `diagnoses`                                                                                                                  | Diagnosis and lookup endpoints.                                                            | Domain workflows that consume reference data remain in their owning modules.                                             |
| `platform/audit` | Audit log recording infrastructure.                                      | `audit_logs`                                                                                                                 | No business HTTP module. Audit is called by modules through platform audit ports/adapters. | Audit is infrastructure, not the owner of business workflows that emit audit events.                                     |

## Current State

Only `identity` has active runtime implementation under `apps/api/src/modules`.
The remaining domain modules are README-only ownership markers until endpoint
or use-case work is added.

Database schema files currently remain centralized under
`apps/api/src/platform/database/schema`. Future module implementation work can
introduce module-owned infrastructure adapters without moving schema files in
the same change.

## New Work Rules

- New HTTP behavior goes under `modules/<domain>/http`.
- New use-case orchestration goes under `modules/<domain>/application`.
- New pure domain concepts go under `modules/<domain>/domain`.
- New persistence adapters go under `modules/<domain>/infrastructure`.
- Cross-module use should go through public module exports, not deep imports.
- Platform code must not import business modules.
- ESLint enforces the current backend import boundaries for platform, domain,
  application, infrastructure, and cross-module deep imports.
