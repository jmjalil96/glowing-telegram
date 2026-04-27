CREATE TABLE "claim_number_counters" (
	"tenant_id" uuid NOT NULL,
	"claim_year" integer NOT NULL,
	"current_value" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_number_counters_tenant_id_claim_year_pk" PRIMARY KEY("tenant_id","claim_year"),
	CONSTRAINT "claim_number_counters_year_check" CHECK ("claim_number_counters"."claim_year" > 0),
	CONSTRAINT "claim_number_counters_current_value_check" CHECK ("claim_number_counters"."current_value" >= 0)
);
--> statement-breakpoint
DROP INDEX "claims_claim_number_unique";--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "insurer_claim_number" text;--> statement-breakpoint
ALTER TABLE "claim_number_counters" ADD CONSTRAINT "claim_number_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "claims_tenant_id_claim_number_unique" ON "claims" USING btree ("tenant_id","claim_number");--> statement-breakpoint
CREATE INDEX "claims_tenant_status_idx" ON "claims" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "claims_tenant_event_date_idx" ON "claims" USING btree ("tenant_id","event_date");--> statement-breakpoint
CREATE INDEX "claims_tenant_sent_to_insurer_at_idx" ON "claims" USING btree ("tenant_id","sent_to_insurer_at");