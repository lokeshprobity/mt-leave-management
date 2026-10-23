CREATE TABLE IF NOT EXISTS "attendance_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "employee_id" integer NOT NULL REFERENCES "employees"("id") ON DELETE cascade,
  "attendance_date" text NOT NULL,
  "status" text DEFAULT 'PRESENT' NOT NULL,
  "check_in" text,
  "check_out" text,
  "source" text DEFAULT 'HR' NOT NULL,
  "remarks" text,
  "marked_by" integer REFERENCES "users"("id") ON DELETE set null,
  "updated_by" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_employee_date_uidx" ON "attendance_records" ("employee_id", "attendance_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_date_idx" ON "attendance_records" ("attendance_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_status_idx" ON "attendance_records" ("status");
