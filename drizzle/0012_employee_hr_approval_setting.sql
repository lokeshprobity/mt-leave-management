ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "hr_approval_required" boolean DEFAULT true NOT NULL;
