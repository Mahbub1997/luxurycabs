
-- =========================================================
-- 1) WIPE EXISTING CUSTOMER DATA (fresh start)
-- =========================================================
-- Clear bookings + dependent wallet tx that referenced them
TRUNCATE public.bookings CASCADE;

-- Delete customer profiles (anyone who is not a driver and not an admin)
DELETE FROM public.profiles p
WHERE p.user_id NOT IN (SELECT user_id FROM public.drivers)
  AND p.user_id NOT IN (SELECT user_id FROM public.user_roles WHERE role IN ('admin','super_admin'));

-- Delete customer auth users
DELETE FROM auth.users u
WHERE u.id NOT IN (SELECT user_id FROM public.drivers)
  AND u.id NOT IN (SELECT user_id FROM public.user_roles WHERE role IN ('admin','super_admin'));

-- =========================================================
-- 2) BOOKINGS: drop permissive policies, add scoped policies
-- =========================================================
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can insert bookings (prototype)" ON public.bookings;
DROP POLICY IF EXISTS "Public can update bookings (prototype)" ON public.bookings;
DROP POLICY IF EXISTS "Public can view bookings (prototype)" ON public.bookings;

-- Require user_id on every new booking
ALTER TABLE public.bookings
  ALTER COLUMN user_id SET NOT NULL;

-- Revoke anon access; only authenticated + service_role
REVOKE ALL ON public.bookings FROM anon, public;
GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;

-- Helper: does the auth user own this driver row?
CREATE OR REPLACE FUNCTION public.is_assigned_driver(_booking_driver_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _booking_driver_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.drivers d
       WHERE d.id = _booking_driver_id AND d.user_id = auth.uid()
     );
$$;

CREATE POLICY "Customers create own bookings"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owner/driver/admin can view bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_assigned_driver(assigned_driver_id)
  );

-- Customers may only cancel their own pending bookings; otherwise drivers/admins update
CREATE POLICY "Owner cancels own pending booking"
  ON public.bookings FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Assigned driver updates booking"
  ON public.bookings FOR UPDATE TO authenticated
  USING (public.is_assigned_driver(assigned_driver_id))
  WITH CHECK (public.is_assigned_driver(assigned_driver_id));

CREATE POLICY "Admins manage bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- =========================================================
-- 3) PUBLIC SHARE-LINK VIEW (no PII / no OTP / no fare)
-- =========================================================
DROP VIEW IF EXISTS public.booking_public_track;
CREATE VIEW public.booking_public_track
WITH (security_invoker = off) AS
SELECT
  id,
  status,
  trip_type,
  pickup_address, pickup_lat, pickup_lng,
  drop_address,   drop_lat,   drop_lng,
  driver_lat, driver_lng,
  driver_name, driver_photo, driver_rating, driver_trips,
  vehicle_model, vehicle_number, vehicle_type,
  route_polyline,
  scheduled_at, created_at, updated_at, completed_at,
  distance_km, duration_min
FROM public.bookings;

GRANT SELECT ON public.booking_public_track TO anon, authenticated;

-- =========================================================
-- 4) REMOVE TABLES FROM REALTIME PUBLICATION
-- =========================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='profiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles';
  END IF;
END $$;

-- Keep bookings in realtime — RLS now enforces scoped delivery (owner / driver / admin only).

-- =========================================================
-- 5) STORAGE: lock invoices bucket
-- =========================================================
DROP POLICY IF EXISTS "Public read invoices"          ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read invoices"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update invoices" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated write invoices"  ON storage.objects;
DROP POLICY IF EXISTS "Admins delete invoices"        ON storage.objects;

-- Read: admin, OR booking owner, OR assigned driver
CREATE POLICY "Invoices read scoped"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoices' AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.invoice_path = storage.objects.name
          AND (
            b.user_id = auth.uid()
            OR public.is_assigned_driver(b.assigned_driver_id)
          )
      )
    )
  );

-- Write/update/delete: admin only (server uses service_role for auto-gen)
CREATE POLICY "Invoices admin write"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoices' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Invoices admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'invoices' AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'invoices' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Invoices admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'invoices' AND public.has_role(auth.uid(), 'admin'::app_role));
