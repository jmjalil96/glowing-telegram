ALTER TABLE "affiliates" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_tenant_id_unique" UNIQUE("id","tenant_id");--> statement-breakpoint
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_user_tenant_fk" FOREIGN KEY ("user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "affiliates_user_id_unique" ON "affiliates" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "affiliates" ADD CONSTRAINT "affiliates_user_id_self_only_check" CHECK ("affiliates"."user_id" is null or (
        "affiliates"."relationship_to_primary" = 'self'
        and "affiliates"."primary_affiliate_id" is null
      ));
