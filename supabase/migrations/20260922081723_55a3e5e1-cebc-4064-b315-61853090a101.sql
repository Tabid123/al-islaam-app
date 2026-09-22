DROP POLICY IF EXISTS "Al-islaam admins view banner images" ON storage.objects;
CREATE POLICY "Al-islaam admins view banner images"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'banners' AND public.is_admin());