CREATE OR REPLACE FUNCTION public.adjust_driver_wallet(_driver_id uuid, _delta numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_balance numeric;
BEGIN
  UPDATE public.drivers
     SET wallet_balance = round((wallet_balance + _delta)::numeric, 2),
         updated_at = now()
   WHERE id = _driver_id
  RETURNING wallet_balance INTO new_balance;
  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'Driver not found';
  END IF;
  RETURN new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_driver_wallet(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_driver_wallet(uuid, numeric) FROM anon;
REVOKE ALL ON FUNCTION public.adjust_driver_wallet(uuid, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_driver_wallet(uuid, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.bookings_owner_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') OR public.is_assigned_driver(OLD.assigned_driver_id) THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR auth.uid() <> OLD.user_id THEN
    RETURN NEW;
  END IF;
  IF NEW.fare IS DISTINCT FROM OLD.fare
     OR NEW.distance_km IS DISTINCT FROM OLD.distance_km
     OR NEW.duration_min IS DISTINCT FROM OLD.duration_min
     OR NEW.tolls IS DISTINCT FROM OLD.tolls
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id THEN
    RAISE EXCEPTION 'Not allowed to modify pricing or assignment';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Not allowed to change trip status';
  END IF;
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status AND NEW.payment_status = 'paid' THEN
    RAISE EXCEPTION 'Only the driver can confirm payment';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_owner_update_guard ON public.bookings;
CREATE TRIGGER trg_bookings_owner_update_guard
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_owner_update_guard();

DROP TRIGGER IF EXISTS trg_bookings_status_guard ON public.bookings;
CREATE TRIGGER trg_bookings_status_guard
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.bookings_status_guard();

DROP TRIGGER IF EXISTS trg_bookings_updated_at ON public.bookings;
CREATE TRIGGER trg_bookings_updated_at
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();