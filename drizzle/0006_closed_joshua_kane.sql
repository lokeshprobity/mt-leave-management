CREATE TABLE "department_shift_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
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
ALTER TABLE "department_shift_assignments" ADD CONSTRAINT "department_shift_assignments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_shift_assignments" ADD CONSTRAINT "department_shift_assignments_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_shift_assignments" ADD CONSTRAINT "department_shift_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_shift_assignments" ADD CONSTRAINT "department_shift_assignments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dept_shift_assign_dept_idx" ON "department_shift_assignments" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "dept_shift_assign_shift_idx" ON "department_shift_assignments" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "dept_shift_assign_active_idx" ON "department_shift_assignments" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "dept_shift_assign_dates_idx" ON "department_shift_assignments" USING btree ("department_id","effective_from","effective_to");