ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS user_id uuid;

CREATE INDEX IF NOT EXISTS bookings_customer_phone_idx ON public.bookings(customer_phone);
CREATE INDEX IF NOT EXISTS bookings_user_id_idx ON public.bookings(user_id);