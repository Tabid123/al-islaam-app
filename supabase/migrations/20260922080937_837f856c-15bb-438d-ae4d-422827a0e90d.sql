DROP POLICY IF EXISTS "Al-islaam admins upload banner images" ON storage.objects;
CREATE POLICY "Al-islaam admins upload banner images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'banners' AND public.is_admin());

DROP POLICY IF EXISTS "Al-islaam admins update banner images" ON storage.objects;
CREATE POLICY "Al-islaam admins update banner images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'banners' AND public.is_admin())
WITH CHECK (bucket_id = 'banners' AND public.is_admin());

DROP POLICY IF EXISTS "Al-islaam admins delete banner images" ON storage.objects;
CREATE POLICY "Al-islaam admins delete banner images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'banners' AND public.is_admin());