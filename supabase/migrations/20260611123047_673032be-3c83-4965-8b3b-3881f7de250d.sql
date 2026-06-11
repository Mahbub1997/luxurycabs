
CREATE TABLE public.local_drop_fares (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_type TEXT NOT NULL DEFAULT 'sedan',
  max_km NUMERIC NOT NULL,
  base_fare NUMERIC NOT NULL DEFAULT 60,
  per_km NUMERIC NOT NULL DEFAULT 30,
  per_min NUMERIC NOT NULL DEFAULT 1,
  total_fare NUMERIC NOT NULL DEFAULT 0,
  is_above BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.local_drop_fares TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.local_drop_fares TO authenticated;
GRANT ALL ON public.local_drop_fares TO service_role;

ALTER TABLE public.local_drop_fares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view local drop fares"
ON public.local_drop_fares FOR SELECT
USING (true);

CREATE POLICY "Admins can insert local drop fares"
ON public.local_drop_fares FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update local drop fares"
ON public.local_drop_fares FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete local drop fares"
ON public.local_drop_fares FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_local_drop_fares_updated_at
BEFORE UPDATE ON public.local_drop_fares
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.local_drop_fares (vehicle_type, max_km, base_fare, per_km, per_min, total_fare, is_above, notes) VALUES
('sedan', 2,  60, 30, 1, 130, false, 'Up to 2 km'),
('sedan', 4,  60, 30, 1, 190, false, 'Up to 4 km'),
('sedan', 6,  60, 30, 1, 250, false, 'Up to 6 km'),
('sedan', 8,  60, 30, 1, 320, false, 'Up to 8 km'),
('sedan', 10, 60, 30, 1, 380, false, 'Up to 10 km'),
('sedan', 12, 60, 30, 1, 450, false, 'Up to 12 km'),
('sedan', 14, 60, 30, 1, 510, false, 'Up to 14 km'),
('sedan', 16, 60, 30, 1, 570, false, 'Up to 16 km'),
('sedan', 18, 60, 30, 1, 640, false, 'Up to 18 km'),
('sedan', 20, 60, 30, 1, 700, false, 'Up to 20 km'),
('sedan', 20, 60, 24, 1, 0,   true,  'Above 20 km — Rs.24 per extra km');
