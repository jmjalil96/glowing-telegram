import { auditLogsTable } from "./schema/audit.js";
import {
  sessionsTable,
  tenantsTable,
  userTokensTable,
  usersTable,
} from "./schema/auth.js";
import {
  claimInvoicesTable,
  claimNumberCountersTable,
  claimSubmissionHistoryTable,
  claimSubmissionsTable,
  claimsTable,
  claimStatusHistoryTable,
} from "./schema/claims.js";
import {
  affiliatesTable,
  clientUsersTable,
  clientsTable,
} from "./schema/clients.js";
import { diagnosesTable } from "./schema/diagnoses.js";
import {
  policyEnrollmentMembersTable,
  policyEnrollmentsTable,
} from "./schema/enrollments.js";
import { insurersTable, policiesTable } from "./schema/policies.js";
import {
  permissionsTable,
  rolePermissionsTable,
  rolesTable,
  userRolesTable,
} from "./schema/rbac.js";

export const databaseSchema = {
  affiliatesTable,
  auditLogsTable,
  claimInvoicesTable,
  claimNumberCountersTable,
  claimSubmissionHistoryTable,
  claimSubmissionsTable,
  claimsTable,
  claimStatusHistoryTable,
  clientUsersTable,
  clientsTable,
  diagnosesTable,
  insurersTable,
  permissionsTable,
  policiesTable,
  policyEnrollmentMembersTable,
  policyEnrollmentsTable,
  rolePermissionsTable,
  rolesTable,
  sessionsTable,
  tenantsTable,
  userTokensTable,
  userRolesTable,
  usersTable,
};
