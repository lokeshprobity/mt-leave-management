ALTER TABLE "leave_policies" ADD COLUMN IF NOT EXISTS "document_required_after_days" integer;--> statement-breakpoint
ALTER TABLE "leave_policies" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD COLUMN IF NOT EXISTS "department_id" integer REFERENCES "departments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD COLUMN IF NOT EXISTS "department_code" text;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD COLUMN IF NOT EXISTS "department_name" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_balances_dept_idx" ON "leave_balances" ("department_id");--> statement-breakpoint
ALTER TABLE "leave_balance_transactions" ADD COLUMN IF NOT EXISTS "leave_type_code" text;--> statement-breakpoint
ALTER TABLE "leave_balance_transactions" ADD COLUMN IF NOT EXISTS "leave_type_name" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lbt_created_at_idx" ON "leave_balance_transactions" ("created_at");--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "applicant_role" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "applicant_operational_role" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "department_id" integer REFERENCES "departments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "department_code" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "department_name" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "team_id" integer REFERENCES "departments"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "team_name" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "assigned_team_leader_id" integer REFERENCES "employees"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "assigned_team_leader_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "assigned_team_leader_name" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "team_leader_resolution_source" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "team_leader_effective_from" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "team_leader_effective_to" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "team_leader_period_label" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "team_leader_decision" text DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "team_leader_decided_by" integer REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "team_leader_decided_by_name" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "team_leader_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "team_leader_remarks" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "hr_decided_by_name" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "management_decided_by_name" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "reporting_manager_id" integer REFERENCES "employees"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "reporting_manager_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "reporting_manager_name" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "current_approval_stage" text DEFAULT 'STAGE_1_TEAM_LEADER' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "approval_stage_label" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "is_escalated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "escalation_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "escalation_reason" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "auto_escalated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "escalated_by" integer REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "has_attachment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "attachment_url" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_requests_team_leader_decision_idx" ON "leave_requests" ("team_leader_decision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_requests_current_stage_idx" ON "leave_requests" ("current_approval_stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_requests_dept_idx" ON "leave_requests" ("department_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_requests_team_idx" ON "leave_requests" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_requests_assigned_tl_idx" ON "leave_requests" ("assigned_team_leader_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_requests_escalation_idx" ON "leave_requests" ("is_escalated");--> statement-breakpoint
ALTER TABLE "leave_request_events" ADD COLUMN IF NOT EXISTS "previous_status" text;--> statement-breakpoint
ALTER TABLE "leave_request_events" ADD COLUMN IF NOT EXISTS "new_status" text;--> statement-breakpoint
ALTER TABLE "leave_request_events" ADD COLUMN IF NOT EXISTS "actor_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "leave_request_events" ADD COLUMN IF NOT EXISTS "actor_employee_code" text;--> statement-breakpoint
ALTER TABLE "leave_request_events" ADD COLUMN IF NOT EXISTS "actor_name" text;--> statement-breakpoint
ALTER TABLE "leave_request_events" ADD COLUMN IF NOT EXISTS "comments" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lre_actor_idx" ON "leave_request_events" ("actor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lre_created_at_idx" ON "leave_request_events" ("created_at");--> statement-breakpoint
ALTER TABLE "holidays" ADD COLUMN IF NOT EXISTS "department_id" integer REFERENCES "departments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "holidays" ADD COLUMN IF NOT EXISTS "department_name" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holidays_dept_date_idx" ON "holidays" ("department_id", "holiday_date");--> statement-breakpoint
ALTER TABLE "team_leader_rotations" ADD COLUMN IF NOT EXISTS "team_id" integer REFERENCES "departments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "team_leader_rotations" ADD COLUMN IF NOT EXISTS "rotation_type" text DEFAULT 'FIRST_HALF_SECOND_HALF' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_leader_rotations" ADD COLUMN IF NOT EXISTS "first_half_leader_id" integer REFERENCES "employees"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "team_leader_rotations" ADD COLUMN IF NOT EXISTS "first_half_leader_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "team_leader_rotations" ADD COLUMN IF NOT EXISTS "second_half_leader_id" integer REFERENCES "employees"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "team_leader_rotations" ADD COLUMN IF NOT EXISTS "second_half_leader_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "team_leader_rotations" ADD COLUMN IF NOT EXISTS "updated_by" integer REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "team_leader_assignments" ADD COLUMN IF NOT EXISTS "team_id" integer REFERENCES "departments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "team_leader_assignments" ADD COLUMN IF NOT EXISTS "team_leader_employee_id" integer REFERENCES "employees"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "team_leader_assignments" ADD COLUMN IF NOT EXISTS "team_leader_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "team_leader_assignments" ADD COLUMN IF NOT EXISTS "assignment_type" text DEFAULT 'STANDARD' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_leader_assignments" ADD COLUMN IF NOT EXISTS "is_override" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "team_leader_assignments" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_leader_assignments" ADD COLUMN IF NOT EXISTS "updated_by" integer REFERENCES "users"("id") ON DELETE SET NULL;

