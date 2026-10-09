ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "code" text;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "display_name" text;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN IF NOT EXISTS "is_system" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "roles" SET "code" = UPPER("name") WHERE "code" IS NULL;--> statement-breakpoint
UPDATE "roles" SET "display_name" = "name" WHERE "display_name" IS NULL;--> statement-breakpoint
UPDATE "roles" SET "is_system" = true WHERE UPPER("name") IN ('SUPER_ADMIN', 'TOP_MANAGEMENT', 'HR', 'TEAM_LEADER', 'EMPLOYEE');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roles_code_idx" ON "roles" ("code");
