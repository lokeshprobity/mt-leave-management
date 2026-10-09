CREATE TABLE "system_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actor_id" integer,
	"actor_role" text,
	"action" text NOT NULL,
	"target_entity" text NOT NULL,
	"target_id" text,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_shift_assignments" ADD COLUMN "assignment_reason" text;--> statement-breakpoint
ALTER TABLE "employee_shift_assignments" ADD COLUMN "remarks" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "reporting_manager_id" integer;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "employment_type" text DEFAULT 'FULL_TIME' NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN "timing_configured" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "system_audit_logs" ADD CONSTRAINT "system_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "system_audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "system_audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_target_idx" ON "system_audit_logs" USING btree ("target_entity","target_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "system_audit_logs" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_reporting_manager_id_employees_id_fk" FOREIGN KEY ("reporting_manager_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;