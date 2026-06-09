
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS selfie_url text,
  ADD COLUMN IF NOT EXISTS license_photo_url text,
  ADD COLUMN IF NOT EXISTS email text;

-- allow drivers to create own profile (only as themselves, only pending)
CREATE POLICY "Drivers insert own row"
  ON public.drivers
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');
