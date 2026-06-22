
-- Drop the view that the linter flagged as SECURITY DEFINER-equivalent
DROP VIEW IF EXISTS public.booking_public_track;

-- Public share-trip endpoint as a SECURITY DEFINER function.
-- Returns only non-sensitive columns. No OTP, no phones, no fare, no user_id.
CREATE OR REPLACE FUNCTION public.get_track_info(_booking_id uuid)
RETURNS TABLE (
  id uuid,
  status booking_status,
  trip_type trip_type,
  pickup_address text, pickup_lat double precision, pickup_lng double precision,
  drop_address text, drop_lat double precision, drop_lng double precision,
  driver_lat double precision, driver_lng double precision,
  driver_name text, driver_photo text, driver_rating numeric, driver_trips integer,
  vehicle_model text, vehicle_number text, vehicle_type vehicle_type,
  route_polyline text,
  scheduled_at timestamptz, created_at timestamptz, updated_at timestamptz, completed_at timestamptz,
  distance_km numeric, duration_min integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.id, b.status, b.trip_type,
    b.pickup_address, b.pickup_lat, b.pickup_lng,
    b.drop_address,   b.drop_lat,   b.drop_lng,
    b.driver_lat, b.driver_lng,
    b.driver_name, b.driver_photo, b.driver_rating, b.driver_trips,
    b.vehicle_model, b.vehicle_number, b.vehicle_type,
    b.route_polyline,
    b.scheduled_at, b.created_at, b.updated_at, b.completed_at,
    b.distance_km, b.duration_min
  FROM public.bookings b
  WHERE b.id = _booking_id
$$;

REVOKE ALL ON FUNCTION public.get_track_info(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_track_info(uuid) TO anon, authenticated;

-- Tighten EXECUTE on internal helpers (they're used by RLS policies, not direct callers)
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_assigned_driver(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_assigned_driver(uuid) TO authenticated, service_role;
