CREATE TYPE "public"."claim_submission_status" AS ENUM('submitted', 'converted', 'not_converted', 'cancelled');--> statement-breakpoint
CREATE TABLE "claim_submission_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"claim_submission_id" uuid NOT NULL,
	"from_status" "claim_submission_status",
	"to_status" "claim_submission_status" NOT NULL,
	"note" text,
	"changed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claim_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"enrollment_member_id" uuid NOT NULL,
	"diagnosis_id" uuid,
	"diagnosis_other_text" text,
	"description" text,
	"status" "claim_submission_status" DEFAULT 'submitted' NOT NULL,
	"submitted_by_user_id" uuid NOT NULL,
	"claim_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claim_submissions_diagnosis_presence_check" CHECK ((
        ("claim_submissions"."diagnosis_id" is not null and "claim_submissions"."diagnosis_other_text" is null)
        or
        ("claim_submissions"."diagnosis_id" is null and "claim_submissions"."diagnosis_other_text" is not null)
      ))
);
--> statement-breakpoint
ALTER TABLE "claim_submission_history" ADD CONSTRAINT "claim_submission_history_claim_submission_id_claim_submissions_id_fk" FOREIGN KEY ("claim_submission_id") REFERENCES "public"."claim_submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_submission_history" ADD CONSTRAINT "claim_submission_history_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_submissions" ADD CONSTRAINT "claim_submissions_enrollment_member_id_policy_enrollment_members_id_fk" FOREIGN KEY ("enrollment_member_id") REFERENCES "public"."policy_enrollment_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_submissions" ADD CONSTRAINT "claim_submissions_diagnosis_id_diagnoses_id_fk" FOREIGN KEY ("diagnosis_id") REFERENCES "public"."diagnoses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_submissions" ADD CONSTRAINT "claim_submissions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_submissions" ADD CONSTRAINT "claim_submissions_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "claim_submission_history_submission_id_idx" ON "claim_submission_history" USING btree ("claim_submission_id");--> statement-breakpoint
CREATE INDEX "claim_submission_history_to_status_idx" ON "claim_submission_history" USING btree ("to_status");--> statement-breakpoint
CREATE INDEX "claim_submission_history_created_at_idx" ON "claim_submission_history" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "claim_submissions_claim_id_unique" ON "claim_submissions" USING btree ("claim_id");--> statement-breakpoint
CREATE INDEX "claim_submissions_status_idx" ON "claim_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "claim_submissions_enrollment_member_id_idx" ON "claim_submissions" USING btree ("enrollment_member_id");--> statement-breakpoint
CREATE INDEX "claim_submissions_diagnosis_id_idx" ON "claim_submissions" USING btree ("diagnosis_id");--> statement-breakpoint
CREATE INDEX "claim_submissions_submitted_by_user_id_idx" ON "claim_submissions" USING btree ("submitted_by_user_id");
