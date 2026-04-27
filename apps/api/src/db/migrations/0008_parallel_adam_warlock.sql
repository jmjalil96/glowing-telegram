CREATE TYPE "public"."policy_enrollment_member_type" AS ENUM('self', 'spouse', 'child', 'other');--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "policy_enrollment_members" ADD COLUMN "member_type" "policy_enrollment_member_type";--> statement-breakpoint
UPDATE "claims" AS "c"
SET "description" = "cs"."description"
FROM "claim_submissions" AS "cs"
WHERE "cs"."claim_id" = "c"."id"
  AND "cs"."description" IS NOT NULL
  AND "c"."description" IS NULL;--> statement-breakpoint
UPDATE "policy_enrollment_members" AS "pem"
SET "member_type" = "a"."relationship_to_primary"::text::"policy_enrollment_member_type"
FROM "affiliates" AS "a"
WHERE "a"."id" = "pem"."affiliate_id"
  AND "a"."tenant_id" = "pem"."tenant_id"
  AND "a"."client_id" = "pem"."client_id";--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "policy_enrollment_members"
    WHERE "member_type" IS NULL
  ) THEN
    RAISE EXCEPTION 'policy_enrollment_members contains rows that could not be backfilled with member type';
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "policy_enrollment_members" ALTER COLUMN "member_type" SET NOT NULL;
