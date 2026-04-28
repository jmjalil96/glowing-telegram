ALTER TABLE "claim_invoices" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
UPDATE "claim_invoices" AS "ci"
SET "tenant_id" = "c"."tenant_id"
FROM "claims" AS "c"
WHERE "c"."id" = "ci"."claim_id";--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "claim_invoices"
    WHERE "tenant_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'claim_invoices contains rows that could not be backfilled with tenant scope';
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "claim_invoices" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "claim_invoices" DROP CONSTRAINT "claim_invoices_claim_id_claims_id_fk";--> statement-breakpoint
ALTER TABLE "claim_invoices" ADD CONSTRAINT "claim_invoices_claim_tenant_fk" FOREIGN KEY ("claim_id","tenant_id") REFERENCES "public"."claims"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_invoices_tenant_id_idx" ON "claim_invoices" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "claim_invoices" ADD CONSTRAINT "claim_invoices_id_tenant_id_unique" UNIQUE("id","tenant_id");
