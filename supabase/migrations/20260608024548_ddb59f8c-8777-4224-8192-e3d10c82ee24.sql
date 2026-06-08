
-- 1. Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'driver', 'customer');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Drivers
CREATE TYPE public.driver_status AS ENUM ('pending', 'approved', 'suspended', 'rejected');

CREATE TABLE public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  photo text,
  license_number text,
  vehicle_type text NOT NULL DEFAULT 'sedan',
  vehicle_model text,
  vehicle_number text,
  status driver_status NOT NULL DEFAULT 'pending',
  is_online boolean NOT NULL DEFAULT false,
  current_lat double precision,
  current_lng double precision,
  rating numeric DEFAULT 5.0,
  total_trips integer NOT NULL DEFAULT 0,
  wallet_balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.drivers TO authenticated;
GRANT ALL ON public.drivers TO service_role;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers read own row" ON public.drivers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Drivers update own row" ON public.drivers FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins manage drivers" ON public.drivers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER drivers_updated_at BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Wallet ledger
CREATE TYPE public.wallet_entry_type AS ENUM ('credit', 'debit', 'commission', 'topup', 'withdrawal');

CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  type wallet_entry_type NOT NULL,
  amount numeric NOT NULL,
  balance_after numeric NOT NULL,
  note text,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers view own ledger" ON public.wallet_transactions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );
CREATE POLICY "Admins write ledger" ON public.wallet_transactions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Withdrawal requests
CREATE TYPE public.withdrawal_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  status withdrawal_status NOT NULL DEFAULT 'pending',
  note text,
  decided_by uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers view own withdrawals" ON public.withdrawal_requests FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );
CREATE POLICY "Drivers create own withdrawals" ON public.withdrawal_requests FOR INSERT TO authenticated
  WITH CHECK (driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid()));
CREATE POLICY "Admins update withdrawals" ON public.withdrawal_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER withdrawals_updated_at BEFORE UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Fare config (admin editable)
CREATE TABLE public.fare_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_type text NOT NULL,
  vehicle_type text NOT NULL,
  base_fare numeric NOT NULL DEFAULT 0,
  per_km numeric NOT NULL DEFAULT 0,
  per_min numeric NOT NULL DEFAULT 0,
  minimum_fare numeric NOT NULL DEFAULT 0,
  outstation_per_km numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(trip_type, vehicle_type)
);
GRANT SELECT ON public.fare_config TO authenticated, anon;
GRANT ALL ON public.fare_config TO service_role;
ALTER TABLE public.fare_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads fare" ON public.fare_config FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Admins edit fare" ON public.fare_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER fare_config_updated_at BEFORE UPDATE ON public.fare_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.fare_config (trip_type, vehicle_type, base_fare, per_km, per_min, minimum_fare, outstation_per_km) VALUES
  ('local',      'sedan', 60, 14, 1.5, 150, 12),
  ('local',      'suv',   90, 19, 2.0, 220, 16),
  ('outstation', 'sedan', 60, 12, 0,   1500, 12),
  ('outstation', 'suv',   90, 16, 0,   1800, 16),
  ('rental',     'sedan', 0,  0,  0,   999,  0),
  ('rental',     'suv',   0,  0,  0,   1499, 0);

-- 6. Booking enhancements
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS assigned_driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS bookings_assigned_driver_idx ON public.bookings(assigned_driver_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx ON public.bookings(status);
