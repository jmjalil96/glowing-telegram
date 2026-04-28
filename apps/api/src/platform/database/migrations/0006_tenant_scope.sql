ALTER TABLE "claims" ADD COLUMN "tenant_id" uuid;
--> statement-breakpoint
ALTER TABLE "claim_status_history" ADD COLUMN "tenant_id" uuid;
--> statement-breakpoint
ALTER TABLE "claim_submissions" ADD COLUMN "tenant_id" uuid;
--> statement-breakpoint
ALTER TABLE "claim_submission_history" ADD COLUMN "tenant_id" uuid;
--> statement-breakpoint
UPDATE "claims" AS "c"
SET "tenant_id" = "pem"."tenant_id"
FROM "policy_enrollment_members" AS "pem"
WHERE "pem"."id" = "c"."enrollment_member_id";
--> statement-breakpoint
UPDATE "claim_submissions" AS "cs"
SET "tenant_id" = "pem"."tenant_id"
FROM "policy_enrollment_members" AS "pem"
WHERE "pem"."id" = "cs"."enrollment_member_id";
--> statement-breakpoint
UPDATE "claim_status_history" AS "csh"
SET "tenant_id" = "c"."tenant_id"
FROM "claims" AS "c"
WHERE "c"."id" = "csh"."claim_id";
--> statement-breakpoint
UPDATE "claim_submission_history" AS "csh"
SET "tenant_id" = "cs"."tenant_id"
FROM "claim_submissions" AS "cs"
WHERE "cs"."id" = "csh"."claim_submission_id";
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "claims"
    WHERE "tenant_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'claims contains rows that could not be backfilled with tenant scope';
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "claim_submissions"
    WHERE "tenant_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'claim_submissions contains rows that could not be backfilled with tenant scope';
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "claim_status_history"
    WHERE "tenant_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'claim_status_history contains rows that could not be backfilled with tenant scope';
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "claim_submission_history"
    WHERE "tenant_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'claim_submission_history contains rows that could not be backfilled with tenant scope';
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "claim_submissions" AS "cs"
    INNER JOIN "users" AS "u" ON "u"."id" = "cs"."submitted_by_user_id"
    WHERE "u"."tenant_id" <> "cs"."tenant_id"
  ) THEN
    RAISE EXCEPTION 'claim_submissions contains cross-tenant submitter associations';
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "claim_submissions" AS "cs"
    INNER JOIN "claims" AS "c" ON "c"."id" = "cs"."claim_id"
    WHERE "cs"."claim_id" IS NOT NULL
      AND "c"."tenant_id" <> "cs"."tenant_id"
  ) THEN
    RAISE EXCEPTION 'claim_submissions contains cross-tenant claim links';
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "claim_status_history" AS "csh"
    INNER JOIN "users" AS "u" ON "u"."id" = "csh"."changed_by_user_id"
    WHERE "csh"."changed_by_user_id" IS NOT NULL
      AND "u"."tenant_id" <> "csh"."tenant_id"
  ) THEN
    RAISE EXCEPTION 'claim_status_history contains cross-tenant actor associations';
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "claim_submission_history" AS "csh"
    INNER JOIN "users" AS "u" ON "u"."id" = "csh"."changed_by_user_id"
    WHERE "csh"."changed_by_user_id" IS NOT NULL
      AND "u"."tenant_id" <> "csh"."tenant_id"
  ) THEN
    RAISE EXCEPTION 'claim_submission_history contains cross-tenant actor associations';
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "audit_logs" AS "al"
    INNER JOIN "users" AS "u" ON "u"."id" = "al"."actor_user_id"
    WHERE "al"."actor_user_id" IS NOT NULL
      AND ("al"."tenant_id" IS NULL OR "u"."tenant_id" <> "al"."tenant_id")
  ) THEN
    RAISE EXCEPTION 'audit_logs contains cross-tenant actor associations';
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "claims" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "claim_status_history" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "claim_submissions" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "claim_submission_history" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "claim_status_history" DROP CONSTRAINT "claim_status_history_claim_id_claims_id_fk";
--> statement-breakpoint
ALTER TABLE "claim_status_history" DROP CONSTRAINT "claim_status_history_changed_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "claims" DROP CONSTRAINT "claims_enrollment_member_id_policy_enrollment_members_id_fk";
--> statement-breakpoint
ALTER TABLE "claim_submissions" DROP CONSTRAINT "claim_submissions_enrollment_member_id_policy_enrollment_members_id_fk";
--> statement-breakpoint
ALTER TABLE "claim_submissions" DROP CONSTRAINT "claim_submissions_submitted_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "claim_submissions" DROP CONSTRAINT "claim_submissions_claim_id_claims_id_fk";
--> statement-breakpoint
ALTER TABLE "claim_submission_history" DROP CONSTRAINT "claim_submission_history_claim_submission_id_claim_submissions_id_fk";
--> statement-breakpoint
ALTER TABLE "claim_submission_history" DROP CONSTRAINT "claim_submission_history_changed_by_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_actor_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "policy_enrollment_members" ADD CONSTRAINT "policy_enrollment_members_id_tenant_id_unique" UNIQUE("id","tenant_id");
--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_id_tenant_id_unique" UNIQUE("id","tenant_id");
--> statement-breakpoint
ALTER TABLE "claim_submissions" ADD CONSTRAINT "claim_submissions_id_tenant_id_unique" UNIQUE("id","tenant_id");
--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_enrollment_member_tenant_fk" FOREIGN KEY ("enrollment_member_id","tenant_id") REFERENCES "public"."policy_enrollment_members"("id","tenant_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claim_status_history" ADD CONSTRAINT "claim_status_history_claim_tenant_fk" FOREIGN KEY ("claim_id","tenant_id") REFERENCES "public"."claims"("id","tenant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claim_status_history" ADD CONSTRAINT "claim_status_history_changed_by_user_tenant_fk" FOREIGN KEY ("changed_by_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE SET NULL ("changed_by_user_id") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claim_submissions" ADD CONSTRAINT "claim_submissions_enrollment_member_tenant_fk" FOREIGN KEY ("enrollment_member_id","tenant_id") REFERENCES "public"."policy_enrollment_members"("id","tenant_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claim_submissions" ADD CONSTRAINT "claim_submissions_submitted_by_user_tenant_fk" FOREIGN KEY ("submitted_by_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claim_submissions" ADD CONSTRAINT "claim_submissions_claim_tenant_fk" FOREIGN KEY ("claim_id","tenant_id") REFERENCES "public"."claims"("id","tenant_id") ON DELETE SET NULL ("claim_id") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claim_submission_history" ADD CONSTRAINT "claim_submission_history_submission_tenant_fk" FOREIGN KEY ("claim_submission_id","tenant_id") REFERENCES "public"."claim_submissions"("id","tenant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "claim_submission_history" ADD CONSTRAINT "claim_submission_history_changed_by_user_tenant_fk" FOREIGN KEY ("changed_by_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE SET NULL ("changed_by_user_id") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_tenant_fk" FOREIGN KEY ("actor_user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE SET NULL ("actor_user_id") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_requires_tenant_check" CHECK ("audit_logs"."actor_user_id" is null or "audit_logs"."tenant_id" is not null);
--> statement-breakpoint
CREATE INDEX "claims_tenant_id_idx" ON "claims" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "claim_status_history_tenant_id_idx" ON "claim_status_history" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "claim_submissions_tenant_id_idx" ON "claim_submissions" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "claim_submission_history_tenant_id_idx" ON "claim_submission_history" USING btree ("tenant_id");
