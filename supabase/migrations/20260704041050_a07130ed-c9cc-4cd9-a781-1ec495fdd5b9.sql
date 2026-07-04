
-- Rental packages
CREATE TABLE public.rental_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  hours INT NOT NULL,
  km INT NOT NULL,
  sedan_price NUMERIC(10,2) NOT NULL,
  suv_price NUMERIC(10,2) NOT NULL,
  extra_per_hour NUMERIC(10,2) NOT NULL DEFAULT 0,
  extra_per_km NUMERIC(10,2) NOT NULL DEFAULT 0,
  sub TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rental_packages TO anon, authenticated;
GRANT ALL ON public.rental_packages TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.rental_packages TO authenticated;
ALTER TABLE public.rental_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read rental packages" ON public.rental_packages FOR SELECT USING (true);
CREATE POLICY "Admins manage rental packages" ON public.rental_packages FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_rental_packages_updated_at BEFORE UPDATE ON public.rental_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.rental_packages (code, label, hours, km, sedan_price, suv_price, extra_per_hour, extra_per_km, sub, sort_order) VALUES
  ('4h40', '4 Hours / 40 KM', 4, 40, 999, 1499, 150, 12, 'Best for short trips', 1),
  ('8h80', '8 Hours / 80 KM', 8, 80, 1899, 2799, 180, 14, 'Ideal for half-day trips', 2),
  ('12h120', '12 Hours / 120 KM', 12, 120, 2799, 3999, 200, 16, 'Best for full-day trips', 3);

-- Outstation vehicles
CREATE TABLE public.outstation_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('sedan','suv')),
  per_km NUMERIC(10,2) NOT NULL,
  bata NUMERIC(10,2) NOT NULL DEFAULT 0,
  seats INT NOT NULL DEFAULT 4,
  bags INT NOT NULL DEFAULT 2,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.outstation_vehicles TO anon, authenticated;
GRANT ALL ON public.outstation_vehicles TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.outstation_vehicles TO authenticated;
ALTER TABLE public.outstation_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read outstation vehicles" ON public.outstation_vehicles FOR SELECT USING (true);
CREATE POLICY "Admins manage outstation vehicles" ON public.outstation_vehicles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_outstation_vehicles_updated_at BEFORE UPDATE ON public.outstation_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.outstation_vehicles (code, label, tier, per_km, bata, seats, bags, sort_order) VALUES
  ('sedan',  'Sedan',         'sedan', 12, 400, 4, 2, 1),
  ('ciaz',   'Ciaz',          'sedan', 13, 400, 4, 2, 2),
  ('ertiga', 'SUV Ertiga',    'suv',   17, 500, 6, 3, 3),
  ('innova', 'SUV Innova',    'suv',   19, 500, 7, 4, 4),
  ('crysta', 'Innova Crysta', 'suv',   21, 500, 7, 4, 5);

-- Outstation config (night halt, min km/day)
CREATE TABLE public.outstation_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  night_halt NUMERIC(10,2) NOT NULL DEFAULT 500,
  min_km_per_day INT NOT NULL DEFAULT 300,
  tax_percent NUMERIC(5,2) NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.outstation_config TO anon, authenticated;
GRANT ALL ON public.outstation_config TO service_role;
GRANT INSERT, UPDATE ON public.outstation_config TO authenticated;
ALTER TABLE public.outstation_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read outstation config" ON public.outstation_config FOR SELECT USING (true);
CREATE POLICY "Admins manage outstation config" ON public.outstation_config FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER update_outstation_config_updated_at BEFORE UPDATE ON public.outstation_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.outstation_config (id, night_halt, min_km_per_day, tax_percent) VALUES (1, 500, 300, 5);
