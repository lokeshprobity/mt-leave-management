ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS return_reason text;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS returned_at timestamptz;
