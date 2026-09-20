
DROP POLICY IF EXISTS "Public read banners" ON storage.objects;
CREATE POLICY "Public read banners" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'banners');

DROP POLICY IF EXISTS "Public read provider-logos" ON storage.objects;
CREATE POLICY "Public read provider-logos" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'provider-logos');

DROP POLICY IF EXISTS "Public read error-icons" ON storage.objects;
CREATE POLICY "Public read error-icons" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'error-icons');
