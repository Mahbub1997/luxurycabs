
CREATE TYPE public.trip_type AS ENUM ('local','outstation','rental');
CREATE TYPE public.vehicle_type AS ENUM ('sedan','suv');
CREATE TYPE public.booking_status AS ENUM ('pending','driver_assigned','driver_arrived','in_progress','completed','cancelled');

CREATE TABLE public.bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_type public.trip_type NOT NULL,
  trip_mode TEXT,
  package_label TEXT,
  pickup_address TEXT NOT NULL,
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  drop_address TEXT NOT NULL,
  drop_lat DOUBLE PRECISION NOT NULL,
  drop_lng DOUBLE PRECISION NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  vehicle_type public.vehicle_type NOT NULL,
  distance_km NUMERIC NOT NULL DEFAULT 0,
  duration_min INTEGER NOT NULL DEFAULT 0,
  fare NUMERIC NOT NULL DEFAULT 0,
  status public.booking_status NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL DEFAULT 'cash',
  otp TEXT NOT NULL DEFAULT lpad(floor(random()*10000)::text,4,'0'),
  driver_name TEXT,
  driver_phone TEXT,
  driver_photo TEXT,
  driver_rating NUMERIC,
  driver_trips INTEGER,
  vehicle_number TEXT,
  vehicle_model TEXT,
  driver_lat DOUBLE PRECISION,
  driver_lng DOUBLE PRECISION,
  route_polyline TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookings TO anon, authenticated;
GRANT ALL ON public.bookings TO service_role;

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view bookings (prototype)" ON public.bookings FOR SELECT USING (true);
CREATE POLICY "Public can insert bookings (prototype)" ON public.bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update bookings (prototype)" ON public.bookings FOR UPDATE USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_bookings_updated_at
BEFORE UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
