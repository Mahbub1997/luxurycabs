
-- Add super_admin role + approval workflow for admins
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS requested_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

-- has_role only matches APPROVED roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND approved = true
  )
$fn$;

-- Clean dummy operational data, keep fare config + drivers/roles
TRUNCATE TABLE public.wallet_transactions, public.withdrawal_requests, public.bookings RESTART IDENTITY CASCADE;
