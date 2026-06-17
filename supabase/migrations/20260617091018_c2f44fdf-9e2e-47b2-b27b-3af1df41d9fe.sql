
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_session_id TEXT,
  ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS session_updated_at TIMESTAMPTZ;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS active_session_id TEXT,
  ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS session_updated_at TIMESTAMPTZ;

-- Allow drivers to update their own active_session_id (existing self-update policies should cover this, but ensure)
-- profiles already has self-update policies in place; no change needed.

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
