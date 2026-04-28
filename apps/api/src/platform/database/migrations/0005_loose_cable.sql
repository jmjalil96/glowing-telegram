ALTER TABLE "client_users" ADD COLUMN "tenant_id" uuid;
--> statement-breakpoint
ALTER TABLE "policy_enrollments" ADD COLUMN "tenant_id" uuid;
--> statement-breakpoint
ALTER TABLE "policy_enrollments" ADD COLUMN "client_id" uuid;
--> statement-breakpoint
ALTER TABLE "policy_enrollment_members" ADD COLUMN "tenant_id" uuid;
--> statement-breakpoint
ALTER TABLE "policy_enrollment_members" ADD COLUMN "client_id" uuid;
--> statement-breakpoint
UPDATE "client_users" AS "cu"
SET "tenant_id" = "c"."tenant_id"
FROM "clients" AS "c"
WHERE "c"."id" = "cu"."client_id";
--> statement-breakpoint
UPDATE "policy_enrollments" AS "pe"
SET
  "tenant_id" = "p"."tenant_id",
  "client_id" = "p"."client_id"
FROM "policies" AS "p"
WHERE "p"."id" = "pe"."policy_id";
--> statement-breakpoint
UPDATE "policy_enrollment_members" AS "pem"
SET
  "tenant_id" = "pe"."tenant_id",
  "client_id" = "pe"."client_id"
FROM "policy_enrollments" AS "pe"
WHERE "pe"."id" = "pem"."enrollment_id";
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "client_users" AS "cu"
    INNER JOIN "users" AS "u" ON "u"."id" = "cu"."user_id"
    INNER JOIN "clients" AS "c" ON "c"."id" = "cu"."client_id"
    WHERE "u"."tenant_id" <> "c"."tenant_id"
  ) THEN
    RAISE EXCEPTION 'client_users contains cross-tenant associations';
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "policy_enrollments" AS "pe"
    INNER JOIN "affiliates" AS "a" ON "a"."id" = "pe"."primary_affiliate_id"
    WHERE
      "a"."tenant_id" <> "pe"."tenant_id"
      OR "a"."client_id" <> "pe"."client_id"
  ) THEN
    RAISE EXCEPTION 'policy_enrollments contains policy and primary affiliate scope mismatches';
  END IF;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "policy_enrollment_members" AS "pem"
    INNER JOIN "affiliates" AS "a" ON "a"."id" = "pem"."affiliate_id"
    WHERE
      "a"."tenant_id" <> "pem"."tenant_id"
      OR "a"."client_id" <> "pem"."client_id"
  ) THEN
    RAISE EXCEPTION 'policy_enrollment_members contains enrollment and affiliate scope mismatches';
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "client_users" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "policy_enrollments" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "policy_enrollments" ALTER COLUMN "client_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "policy_enrollment_members" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "policy_enrollment_members" ALTER COLUMN "client_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "client_users" DROP CONSTRAINT "client_users_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "client_users" DROP CONSTRAINT "client_users_client_id_clients_id_fk";
--> statement-breakpoint
ALTER TABLE "policy_enrollments" DROP CONSTRAINT "policy_enrollments_policy_id_policies_id_fk";
--> statement-breakpoint
ALTER TABLE "policy_enrollments" DROP CONSTRAINT "policy_enrollments_primary_affiliate_id_affiliates_id_fk";
--> statement-breakpoint
ALTER TABLE "policy_enrollment_members" DROP CONSTRAINT "policy_enrollment_members_enrollment_id_policy_enrollments_id_fk";
--> statement-breakpoint
ALTER TABLE "policy_enrollment_members" DROP CONSTRAINT "policy_enrollment_members_affiliate_id_affiliates_id_fk";
--> statement-breakpoint
DROP INDEX "client_users_client_id_idx";
--> statement-breakpoint
DROP INDEX "policy_enrollment_members_affiliate_id_idx";
--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_id_tenant_client_unique" UNIQUE("id","tenant_id","client_id");
--> statement-breakpoint
ALTER TABLE "policy_enrollments" ADD CONSTRAINT "policy_enrollments_id_tenant_client_unique" UNIQUE("id","tenant_id","client_id");
--> statement-breakpoint
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_user_tenant_fk" FOREIGN KEY ("user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_client_tenant_fk" FOREIGN KEY ("client_id","tenant_id") REFERENCES "public"."clients"("id","tenant_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "policy_enrollments" ADD CONSTRAINT "policy_enrollments_policy_scope_fk" FOREIGN KEY ("policy_id","tenant_id","client_id") REFERENCES "public"."policies"("id","tenant_id","client_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "policy_enrollments" ADD CONSTRAINT "policy_enrollments_primary_affiliate_scope_fk" FOREIGN KEY ("primary_affiliate_id","tenant_id","client_id") REFERENCES "public"."affiliates"("id","tenant_id","client_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "policy_enrollment_members" ADD CONSTRAINT "policy_enrollment_members_enrollment_scope_fk" FOREIGN KEY ("enrollment_id","tenant_id","client_id") REFERENCES "public"."policy_enrollments"("id","tenant_id","client_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "policy_enrollment_members" ADD CONSTRAINT "policy_enrollment_members_affiliate_scope_fk" FOREIGN KEY ("affiliate_id","tenant_id","client_id") REFERENCES "public"."affiliates"("id","tenant_id","client_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "client_users_client_id_idx" ON "client_users" USING btree ("client_id","tenant_id");
--> statement-breakpoint
CREATE INDEX "policy_enrollments_client_id_idx" ON "policy_enrollments" USING btree ("client_id","tenant_id");
--> statement-breakpoint
CREATE INDEX "policy_enrollment_members_affiliate_id_idx" ON "policy_enrollment_members" USING btree ("affiliate_id","tenant_id","client_id");
