# Reference Data Module

This module owns shared lookup and reference data.

Owned schema tables:

- `diagnoses`

Likely future API work:

- diagnosis lookup endpoints
- reference data search and listing endpoints

Non-ownership boundaries:

- workflows that consume reference data belong to their business modules
- claim processing belongs to `claims`
- audit recording infrastructure belongs to `platform/audit`

This module is currently documentation-only. Do not add source files here until
there is real reference-data behavior to implement.
