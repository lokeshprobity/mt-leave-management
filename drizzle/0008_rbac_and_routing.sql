ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "permissions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "holiday_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"list_code" text NOT NULL UNIQUE,
	"list_name" text NOT NULL,
	"year" integer DEFAULT 2026 NOT NULL,
	"department_id" integer REFERENCES "departments"("id") ON DELETE SET NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "holiday_lists_code_idx" ON "holiday_lists" ("list_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holiday_lists_year_idx" ON "holiday_lists" ("year");--> statement-breakpoint
ALTER TABLE "holidays" ADD COLUMN IF NOT EXISTS "holiday_list_id" integer REFERENCES "holiday_lists"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "holidays" ADD COLUMN IF NOT EXISTS "department_id" integer REFERENCES "departments"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "holidays" ADD COLUMN IF NOT EXISTS "department_name" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holidays_list_idx" ON "holidays" ("holiday_list_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holidays_dept_date_idx" ON "holidays" ("department_id", "holiday_date");--> statement-breakpoint
ALTER TABLE "holidays" DROP CONSTRAINT IF EXISTS "holidays_holiday_date_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "holidays_holiday_date_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "holidays_date_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "holidays_date_idx" ON "holidays" ("holiday_date");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employee_holiday_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
	"holiday_list_id" integer NOT NULL REFERENCES "holiday_lists"("id") ON DELETE RESTRICT,
	"effective_from" text NOT NULL,
	"effective_to" text,
	"assigned_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"remarks" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emp_holiday_assign_emp_idx" ON "employee_holiday_assignments" ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emp_holiday_assign_list_idx" ON "employee_holiday_assignments" ("holiday_list_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "emp_holiday_assign_dates_idx" ON "employee_holiday_assignments" ("employee_id", "effective_from", "effective_to");--> statement-breakpoint
ALTER TABLE "employee_shift_assignments" ADD COLUMN IF NOT EXISTS "custom_segments" jsonb;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "overtime_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
	"date" text NOT NULL,
	"end_date" text,
	"start_time" text,
	"end_time" text,
	"hours" numeric(5, 2) NOT NULL,
	"shift_id" integer REFERENCES "shifts"("id") ON DELETE SET NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"assigned_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"approved_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"approved_at" timestamp with time zone,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ot_emp_idx" ON "overtime_requests" ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ot_date_idx" ON "overtime_requests" ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ot_status_idx" ON "overtime_requests" ("status");--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD COLUMN IF NOT EXISTS "end_date" text;--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD COLUMN IF NOT EXISTS "start_time" text;--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD COLUMN IF NOT EXISTS "end_time" text;--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD COLUMN IF NOT EXISTS "assigned_by" integer REFERENCES "users"("id") ON DELETE SET NULL;

