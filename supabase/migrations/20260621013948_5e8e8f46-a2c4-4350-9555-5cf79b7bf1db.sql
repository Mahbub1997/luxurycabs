ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS invoice_url text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS invoice_path text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS invoice_generated_at timestamptz;

-- Storage policies for invoices bucket (bucket itself created via tool)
CREATE POLICY "Authenticated read invoices" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'invoices');
CREATE POLICY "Public read invoices" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'invoices');
CREATE POLICY "Authenticated write invoices" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'invoices');
CREATE POLICY "Authenticated update invoices" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'invoices');
CREATE POLICY "Admins delete invoices" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'invoices' AND public.has_role(auth.uid(), 'admin'::app_role));