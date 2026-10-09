CREATE TABLE "employee_shift_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"shift_id" integer NOT NULL,
	"effective_from" text NOT NULL,
	"effective_to" text,
	"work_days_of_week" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_segments" (
	"id" serial PRIMARY KEY NOT NULL,
	"shift_id" integer NOT NULL,
	"segment_sequence" integer DEFAULT 1 NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"crosses_midnight" boolean DEFAULT false NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"shift_code" text NOT NULL,
	"shift_name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shifts_shift_code_unique" UNIQUE("shift_code")
);
--> statement-breakpoint
ALTER TABLE "employee_shift_assignments" ADD CONSTRAINT "employee_shift_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_shift_assignments" ADD CONSTRAINT "employee_shift_assignments_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_shift_assignments" ADD CONSTRAINT "employee_shift_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_shift_assignments" ADD CONSTRAINT "employee_shift_assignments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_segments" ADD CONSTRAINT "shift_segments_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emp_shift_assign_emp_idx" ON "employee_shift_assignments" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "emp_shift_assign_shift_idx" ON "employee_shift_assignments" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "emp_shift_assign_active_idx" ON "employee_shift_assignments" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "emp_shift_assign_dates_idx" ON "employee_shift_assignments" USING btree ("employee_id","effective_from","effective_to");--> statement-breakpoint
CREATE INDEX "shift_segments_shift_id_idx" ON "shift_segments" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "shift_segments_seq_idx" ON "shift_segments" USING btree ("shift_id","segment_sequence");--> statement-breakpoint
CREATE INDEX "shift_segments_is_active_idx" ON "shift_segments" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_shift_code_idx" ON "shifts" USING btree ("shift_code");--> statement-breakpoint
CREATE INDEX "shifts_is_active_idx" ON "shifts" USING btree ("is_active");