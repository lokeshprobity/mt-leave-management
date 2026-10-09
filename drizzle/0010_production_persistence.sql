ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "operational_role" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_photo" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "credential_email" jsonb;--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "head_employee_id" integer;--> statement-breakpoint
ALTER TABLE "designations" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "office_location" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "remarks" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL UNIQUE,
	"user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_hash_idx" ON "password_reset_tokens" ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_idx" ON "password_reset_tokens" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expires_idx" ON "password_reset_tokens" ("expires_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employee_weekly_off_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
	"weekly_off_days" jsonb DEFAULT '[0]'::jsonb NOT NULL,
	"effective_from" text NOT NULL,
	"effective_to" text,
	"remarks" text,
	"created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emp_weekly_off_emp_idx" ON "employee_weekly_off_assignments" ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emp_weekly_off_dates_idx" ON "employee_weekly_off_assignments" ("employee_id", "effective_from", "effective_to");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stored_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"storage_path" text NOT NULL UNIQUE,
	"file_name" text NOT NULL UNIQUE,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"sub_dir" text DEFAULT 'attachments' NOT NULL,
	"file_data_base64" text NOT NULL,
	"uploaded_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stored_attachments_path_idx" ON "stored_attachments" ("storage_path");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stored_attachments_filename_idx" ON "stored_attachments" ("file_name");--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "shift_type" text DEFAULT 'DAY' NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "start_time" text;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "end_time" text;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "total_working_hours" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "break_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "weekly_off" text DEFAULT 'Sunday';--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "effective_from" text;--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "effective_to" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_leader_rotations" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
	"rotation_type" text DEFAULT 'FIRST_HALF_SECOND_HALF' NOT NULL,
	"first_half_leader_id" integer NOT NULL REFERENCES "employees"("id") ON DELETE RESTRICT,
	"first_half_leader_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"second_half_leader_id" integer NOT NULL REFERENCES "employees"("id") ON DELETE RESTRICT,
	"second_half_leader_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"effective_from" text NOT NULL,
	"effective_to" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"remarks" text,
	"created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"updated_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tl_rot_team_idx" ON "team_leader_rotations" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tl_rot_active_idx" ON "team_leader_rotations" ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tl_rot_dates_idx" ON "team_leader_rotations" ("team_id", "effective_from", "effective_to");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_leader_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" integer NOT NULL REFERENCES "departments"("id") ON DELETE CASCADE,
	"team_leader_employee_id" integer NOT NULL REFERENCES "employees"("id") ON DELETE RESTRICT,
	"team_leader_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"effective_from" text NOT NULL,
	"effective_to" text NOT NULL,
	"assignment_type" text DEFAULT 'STANDARD' NOT NULL,
	"is_override" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"remarks" text,
	"created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"updated_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tla_team_idx" ON "team_leader_assignments" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tla_employee_idx" ON "team_leader_assignments" ("team_leader_employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tla_active_idx" ON "team_leader_assignments" ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tla_dates_idx" ON "team_leader_assignments" ("team_id", "effective_from", "effective_to");
