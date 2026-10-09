CREATE TABLE "leave_balance_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"leave_type_id" integer NOT NULL,
	"leave_balance_id" integer NOT NULL,
	"transaction_type" text NOT NULL,
	"quantity" numeric(6, 2) NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"remarks" text,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"leave_type_id" integer NOT NULL,
	"opening_balance" numeric(6, 2) DEFAULT '0.00' NOT NULL,
	"allocated" numeric(6, 2) DEFAULT '0.00' NOT NULL,
	"carry_forward" numeric(6, 2) DEFAULT '0.00' NOT NULL,
	"adjustments" numeric(6, 2) DEFAULT '0.00' NOT NULL,
	"used" numeric(6, 2) DEFAULT '0.00' NOT NULL,
	"reserved" numeric(6, 2) DEFAULT '0.00' NOT NULL,
	"available" numeric(6, 2) DEFAULT '0.00' NOT NULL,
	"year" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"leave_type_id" integer NOT NULL,
	"policy_name" text NOT NULL,
	"annual_allocation" numeric(6, 2) DEFAULT '0.00' NOT NULL,
	"allocation_frequency" text DEFAULT 'ANNUAL' NOT NULL,
	"carry_forward_allowed" boolean DEFAULT false NOT NULL,
	"carry_forward_limit" numeric(6, 2) DEFAULT '0.00' NOT NULL,
	"expiry_enabled" boolean DEFAULT false NOT NULL,
	"expiry_period" text,
	"maximum_consecutive_days" integer DEFAULT 0 NOT NULL,
	"minimum_notice_days" integer DEFAULT 0 NOT NULL,
	"same_day_allowed" boolean DEFAULT true NOT NULL,
	"late_request_allowed" boolean DEFAULT false NOT NULL,
	"post_start_request_allowed" boolean DEFAULT false NOT NULL,
	"emergency_exception_allowed" boolean DEFAULT false NOT NULL,
	"negative_balance_allowed" boolean DEFAULT false NOT NULL,
	"document_required" boolean DEFAULT false NOT NULL,
	"half_day_allowed" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"applicable_department_id" integer,
	"applicable_designation_id" integer,
	"applicable_employment_status" text,
	"min_service_months" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_paid" boolean DEFAULT true NOT NULL,
	"requires_document" boolean DEFAULT false NOT NULL,
	"supports_half_day" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "leave_balance_transactions" ADD CONSTRAINT "leave_balance_transactions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_transactions" ADD CONSTRAINT "leave_balance_transactions_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_transactions" ADD CONSTRAINT "leave_balance_transactions_leave_balance_id_leave_balances_id_fk" FOREIGN KEY ("leave_balance_id") REFERENCES "public"."leave_balances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_transactions" ADD CONSTRAINT "leave_balance_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_applicable_department_id_departments_id_fk" FOREIGN KEY ("applicable_department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_applicable_designation_id_designations_id_fk" FOREIGN KEY ("applicable_designation_id") REFERENCES "public"."designations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lbt_employee_idx" ON "leave_balance_transactions" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "lbt_leave_type_idx" ON "leave_balance_transactions" USING btree ("leave_type_id");--> statement-breakpoint
CREATE INDEX "lbt_balance_idx" ON "leave_balance_transactions" USING btree ("leave_balance_id");--> statement-breakpoint
CREATE INDEX "lbt_transaction_type_idx" ON "leave_balance_transactions" USING btree ("transaction_type");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_leave_type_year_idx" ON "leave_balances" USING btree ("employee_id","leave_type_id","year");--> statement-breakpoint
CREATE INDEX "leave_balances_employee_idx" ON "leave_balances" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "leave_balances_leave_type_idx" ON "leave_balances" USING btree ("leave_type_id");--> statement-breakpoint
CREATE INDEX "leave_balances_year_idx" ON "leave_balances" USING btree ("year");--> statement-breakpoint
CREATE INDEX "leave_policies_leave_type_idx" ON "leave_policies" USING btree ("leave_type_id");--> statement-breakpoint
CREATE INDEX "leave_policies_is_active_idx" ON "leave_policies" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "leave_policies_dept_idx" ON "leave_policies" USING btree ("applicable_department_id");--> statement-breakpoint
CREATE INDEX "leave_policies_desig_idx" ON "leave_policies" USING btree ("applicable_designation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_types_code_idx" ON "leave_types" USING btree ("code");--> statement-breakpoint
CREATE INDEX "leave_types_is_active_idx" ON "leave_types" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "leave_types_display_order_idx" ON "leave_types" USING btree ("display_order");