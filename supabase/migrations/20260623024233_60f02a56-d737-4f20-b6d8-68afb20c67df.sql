
-- 1) One-time super admin claim. Any authenticated user can call; only succeeds
--    if NO super_admin exists yet.
CREATE OR REPLACE FUNCTION public.claim_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing uuid;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Must be signed in';
  END IF;
  SELECT user_id INTO existing FROM public.user_roles WHERE role = 'super_admin' AND approved = true LIMIT 1;
  IF existing IS NOT NULL THEN
    IF existing = uid THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'Super admin already exists';
  END IF;
  INSERT INTO public.user_roles(user_id, role, approved, approved_at, approved_by)
  VALUES (uid, 'super_admin', true, now(), uid)
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_super_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.claim_super_admin() TO authenticated;

-- 2) Server-side OTP verification to start trip.
CREATE OR REPLACE FUNCTION public.verify_start_trip(_booking_id uuid, _otp text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.bookings%ROWTYPE;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT public.is_assigned_driver(b.assigned_driver_id) THEN
    RAISE EXCEPTION 'Not your booking';
  END IF;
  IF b.status NOT IN ('driver_assigned','driver_arrived') THEN
    RAISE EXCEPTION 'Trip not in startable state';
  END IF;
  IF coalesce(b.otp,'') = '' OR _otp IS NULL OR btrim(_otp) <> b.otp THEN
    RAISE EXCEPTION 'Wrong OTP';
  END IF;
  UPDATE public.bookings SET status = 'in_progress', updated_at = now() WHERE id = _booking_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.verify_start_trip(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_start_trip(uuid, text) TO authenticated;

-- 3) Status guard: cannot transition cancelled → completed.
CREATE OR REPLACE FUNCTION public.bookings_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'cancelled' AND NEW.status = 'completed' THEN
    RAISE EXCEPTION 'Cancelled booking cannot be completed';
  END IF;
  -- When cancelling, clear assigned driver so they cannot complete it later.
  IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
    NEW.assigned_driver_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_bookings_status_guard ON public.bookings;
CREATE TRIGGER trg_bookings_status_guard
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_status_guard();

-- 4) Stop broadcasting sensitive tables on realtime (reads still work via Data API).
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.drivers; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
