# Claims Module

This module owns claim processing and claim lifecycle records.

Owned schema tables:

- `claim_number_counters`
- `claims`
- `claim_status_history`
- `claim_invoices`
- `claim_submissions`
- `claim_submission_history`

Likely future API work:

- claim creation and updates
- claim number generation
- claim invoice management
- insurer submission tracking
- claim and submission status transitions

Non-ownership boundaries:

- diagnosis lookup data belongs to `reference-data`
- enrollment member records belong to `enrollments`
- policy definitions belong to `policies`
- current-user identity context comes from public `identity` exports only

This module is currently documentation-only. Do not add source files here until
there is real claim behavior to implement.
