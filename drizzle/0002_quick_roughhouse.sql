CREATE TABLE "holidays" (
	"id" serial PRIMARY KEY NOT NULL,
	"holiday_date" text NOT NULL,
	"holiday_name" text NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"year" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holidays_holiday_date_unique" UNIQUE("holiday_date")
);
--> statement-breakpoint
CREATE TABLE "leave_request_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"leave_request_id" integer NOT NULL,
	"event_type" text NOT NULL,
	"actor_id" integer,
	"actor_role" text NOT NULL,
	"remarks" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_number" text NOT NULL,
	"employee_id" integer NOT NULL,
	"leave_type_id" integer NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"total_days" numeric(6, 2) NOT NULL,
	"day_type" text NOT NULL,
	"half_day_period" text,
	"reason_category" text,
	"reason" text NOT NULL,
	"request_classification" text NOT NULL,
	"application_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attachment_required" boolean DEFAULT false NOT NULL,
	"attachment_path" text,
	"attachment_name" text,
	"attachment_size" integer,
	"attachment_mime" text,
	"cancellation_reason" text,
	"cancellation_timestamp" timestamp with time zone,
	"notice_minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_requests_request_number_unique" UNIQUE("request_number")
);
--> statement-breakpoint
ALTER TABLE "leave_request_events" ADD CONSTRAINT "leave_request_events_leave_request_id_leave_requests_id_fk" FOREIGN KEY ("leave_request_id") REFERENCES "public"."leave_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_request_events" ADD CONSTRAINT "leave_request_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "holidays_date_idx" ON "holidays" USING btree ("holiday_date");--> statement-breakpoint
CREATE INDEX "holidays_year_idx" ON "holidays" USING btree ("year");--> statement-breakpoint
CREATE INDEX "holidays_is_active_idx" ON "holidays" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "lre_request_id_idx" ON "leave_request_events" USING btree ("leave_request_id");--> statement-breakpoint
CREATE INDEX "lre_event_type_idx" ON "leave_request_events" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_requests_number_idx" ON "leave_requests" USING btree ("request_number");--> statement-breakpoint
CREATE INDEX "leave_requests_employee_idx" ON "leave_requests" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "leave_requests_leave_type_idx" ON "leave_requests" USING btree ("leave_type_id");--> statement-breakpoint
CREATE INDEX "leave_requests_status_idx" ON "leave_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leave_requests_dates_idx" ON "leave_requests" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "leave_requests_created_at_idx" ON "leave_requests" USING btree ("created_at");