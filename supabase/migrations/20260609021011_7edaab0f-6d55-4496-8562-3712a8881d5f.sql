
CREATE POLICY "Drivers upload own docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'driver-docs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Drivers read own docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'driver-docs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Drivers update own docs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'driver-docs' AND (storage.foldername(name))[1] = auth.uid()::text);
