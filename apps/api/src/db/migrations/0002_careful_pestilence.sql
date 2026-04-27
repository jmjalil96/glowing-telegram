CREATE TYPE "public"."claim_attention_type" AS ENUM('ambulatory', 'hospitalary', 'emergency', 'pharmacy', 'dental', 'other');--> statement-breakpoint
CREATE TYPE "public"."claim_status" AS ENUM('internal_review', 'submitted_to_insurer', 'pending_information', 'not_processed', 'settled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."affiliate_relationship_to_primary" AS ENUM('self', 'spouse', 'child', 'other');--> statement-breakpoint
CREATE TYPE "public"."policy_enrollment_intake_reason" AS ENUM('initial_load', 'new_enrollment', 'renewal', 'change', 'correction');--> statement-breakpoint
CREATE TYPE "public"."policy_enrollment_outtake_reason" AS ENUM('change', 'terminated', 'policy_end', 'correction');--> statement-breakpoint
CREATE TABLE "claim_invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"claim_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"provider" text NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_invoices_value_non_negative_check" CHECK ("claim_invoices"."value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "claim_status_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"claim_id" uuid NOT NULL,
	"from_status" "claim_status",
	"to_status" "claim_status" NOT NULL,
	"note" text,
	"changed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"claim_number" text NOT NULL,
	"status" "claim_status" NOT NULL,
	"enrollment_member_id" uuid NOT NULL,
	"intake_submitted_at" timestamp with time zone,
	"sent_to_insurer_at" timestamp with time zone,
	"event_date" date NOT NULL,
	"attention_type" "claim_attention_type" NOT NULL,
	"diagnosis_id" uuid,
	"diagnosis_other_text" text,
	"submitted_amount" numeric(12, 2) NOT NULL,
	"not_eligible_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"not_processed_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"copay_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"deductible_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"settlement_number" text,
	"settlement_date" date,
	"settlement_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claims_non_negative_amounts_check" CHECK ("claims"."submitted_amount" >= 0
        and "claims"."not_eligible_amount" >= 0
        and "claims"."not_processed_amount" >= 0
        and "claims"."copay_amount" >= 0
        and "claims"."deductible_amount" >= 0
        and "claims"."paid_amount" >= 0),
	CONSTRAINT "claims_paid_amount_lte_submitted_amount_check" CHECK ("claims"."paid_amount" <= "claims"."submitted_amount"),
	CONSTRAINT "claims_diagnosis_source_check" CHECK ("claims"."diagnosis_id" is null or "claims"."diagnosis_other_text" is null)
);
--> statement-breakpoint
CREATE TABLE "affiliates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"primary_affiliate_id" uuid,
	"document_number" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"relationship_to_primary" "affiliate_relationship_to_primary" NOT NULL,
	"birth_date" date NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliates_id_tenant_client_unique" UNIQUE("id","tenant_id","client_id"),
	CONSTRAINT "affiliates_primary_affiliate_presence_check" CHECK ((
        ("affiliates"."relationship_to_primary" = 'self' and "affiliates"."primary_affiliate_id" is null)
        or
        ("affiliates"."relationship_to_primary" <> 'self' and "affiliates"."primary_affiliate_id" is not null)
      )),
	CONSTRAINT "affiliates_primary_affiliate_not_self_check" CHECK ("affiliates"."primary_affiliate_id" is null or "affiliates"."primary_affiliate_id" <> "affiliates"."id")
);
--> statement-breakpoint
CREATE TABLE "client_users" (
	"user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_users_user_id_client_id_pk" PRIMARY KEY("user_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "diagnoses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(32) NOT NULL,
	"description" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insurers_id_tenant_id_unique" UNIQUE("id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"insurer_id" uuid NOT NULL,
	"policy_number" text NOT NULL,
	"effective_date" date NOT NULL,
	"expiration_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policies_date_range_check" CHECK ("policies"."expiration_date" is null or "policies"."expiration_date" >= "policies"."effective_date")
);
--> statement-breakpoint
CREATE TABLE "policy_enrollments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"policy_id" uuid NOT NULL,
	"primary_affiliate_id" uuid NOT NULL,
	"intake_reason" "policy_enrollment_intake_reason" NOT NULL,
	"outtake_reason" "policy_enrollment_outtake_reason",
	"effective_date" date NOT NULL,
	"ended_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policy_enrollments_date_range_check" CHECK ("policy_enrollments"."ended_on" is null or "policy_enrollments"."ended_on" >= "policy_enrollments"."effective_date")
);
--> statement-breakpoint
CREATE TABLE "policy_enrollment_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"affiliate_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_invoices" ADD CONSTRAINT "claim_invoices_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_status_history" ADD CONSTRAINT "claim_status_history_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_status_history" ADD CONSTRAINT "claim_status_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_enrollment_member_id_policy_enrollment_members_id_fk" FOREIGN KEY ("enrollment_member_id") REFERENCES "public"."policy_enrollment_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_diagnosis_id_diagnoses_id_fk" FOREIGN KEY ("diagnosis_id") REFERENCES "public"."diagnoses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_client_tenant_fk" FOREIGN KEY ("client_id","tenant_id") REFERENCES "public"."clients"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_primary_affiliate_scope_fk" FOREIGN KEY ("primary_affiliate_id","tenant_id","client_id") REFERENCES "public"."affiliates"("id","tenant_id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurers" ADD CONSTRAINT "insurers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_client_tenant_fk" FOREIGN KEY ("client_id","tenant_id") REFERENCES "public"."clients"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_insurer_tenant_fk" FOREIGN KEY ("insurer_id","tenant_id") REFERENCES "public"."insurers"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_enrollments" ADD CONSTRAINT "policy_enrollments_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_enrollments" ADD CONSTRAINT "policy_enrollments_primary_affiliate_id_affiliates_id_fk" FOREIGN KEY ("primary_affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_enrollment_members" ADD CONSTRAINT "policy_enrollment_members_enrollment_id_policy_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."policy_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_enrollment_members" ADD CONSTRAINT "policy_enrollment_members_affiliate_id_affiliates_id_fk" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_invoices_claim_id_idx" ON "claim_invoices" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_invoices_claim_invoice_number_unique" ON "claim_invoices" USING btree ("claim_id","invoice_number");--> statement-breakpoint
CREATE INDEX "claim_status_history_claim_id_idx" ON "claim_status_history" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "claim_status_history_to_status_idx" ON "claim_status_history" USING btree ("to_status");--> statement-breakpoint
CREATE INDEX "claim_status_history_created_at_idx" ON "claim_status_history" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "claims_claim_number_unique" ON "claims" USING btree ("claim_number");--> statement-breakpoint
CREATE INDEX "claims_status_idx" ON "claims" USING btree ("status");--> statement-breakpoint
CREATE INDEX "claims_enrollment_member_id_idx" ON "claims" USING btree ("enrollment_member_id");--> statement-breakpoint
CREATE INDEX "claims_diagnosis_id_idx" ON "claims" USING btree ("diagnosis_id");--> statement-breakpoint
CREATE INDEX "claims_event_date_idx" ON "claims" USING btree ("event_date");--> statement-breakpoint
CREATE INDEX "claims_sent_to_insurer_at_idx" ON "claims" USING btree ("sent_to_insurer_at");--> statement-breakpoint
CREATE INDEX "affiliates_tenant_id_idx" ON "affiliates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "affiliates_client_id_idx" ON "affiliates" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "affiliates_primary_affiliate_id_idx" ON "affiliates" USING btree ("primary_affiliate_id");--> statement-breakpoint
CREATE INDEX "client_users_client_id_idx" ON "client_users" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "clients_tenant_id_idx" ON "clients" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "diagnoses_code_unique" ON "diagnoses" USING btree ("code");--> statement-breakpoint
CREATE INDEX "insurers_tenant_id_idx" ON "insurers" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "insurers_tenant_id_name_unique" ON "insurers" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "policies_tenant_id_idx" ON "policies" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "policies_client_id_idx" ON "policies" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "policies_insurer_id_idx" ON "policies" USING btree ("insurer_id");--> statement-breakpoint
CREATE INDEX "policy_enrollments_policy_id_idx" ON "policy_enrollments" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "policy_enrollments_primary_affiliate_id_idx" ON "policy_enrollments" USING btree ("primary_affiliate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "policy_enrollment_members_enrollment_affiliate_unique" ON "policy_enrollment_members" USING btree ("enrollment_id","affiliate_id");--> statement-breakpoint
CREATE INDEX "policy_enrollment_members_affiliate_id_idx" ON "policy_enrollment_members" USING btree ("affiliate_id");
