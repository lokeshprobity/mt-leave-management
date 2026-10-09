ALTER TABLE "leave_request_events" ADD COLUMN "action" text;--> statement-breakpoint
ALTER TABLE "leave_request_events" ADD COLUMN "previous_decision" text;--> statement-breakpoint
ALTER TABLE "leave_request_events" ADD COLUMN "new_decision" text;--> statement-breakpoint
ALTER TABLE "leave_request_events" ADD COLUMN "ip_address" text;--> statement-breakpoint
ALTER TABLE "leave_request_events" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "hr_decision" text DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "hr_decided_by" integer;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "hr_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "hr_remarks" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "management_decision" text DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "management_decided_by" integer;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "management_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "management_remarks" text;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "final_status" text DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "balance_posted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_hr_decided_by_users_id_fk" FOREIGN KEY ("hr_decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_management_decided_by_users_id_fk" FOREIGN KEY ("management_decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_requests_hr_decision_idx" ON "leave_requests" USING btree ("hr_decision");--> statement-breakpoint
CREATE INDEX "leave_requests_management_decision_idx" ON "leave_requests" USING btree ("management_decision");--> statement-breakpoint
CREATE INDEX "leave_requests_final_status_idx" ON "leave_requests" USING btree ("final_status");