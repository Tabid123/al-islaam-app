-- Provision APK storage separately from release metadata.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('app-releases', 'app-releases', false, 209715200,
        ARRAY['application/vnd.android.package-archive'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Al-islaam admins upload APK releases" ON storage.objects;
CREATE POLICY "Al-islaam admins upload APK releases"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'app-releases' AND public.is_admin());

DROP POLICY IF EXISTS "Al-islaam admins read APK releases" ON storage.objects;
CREATE POLICY "Al-islaam admins read APK releases"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'app-releases' AND public.is_admin());

DROP POLICY IF EXISTS "Al-islaam admins update APK releases" ON storage.objects;
CREATE POLICY "Al-islaam admins update APK releases"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'app-releases' AND public.is_admin())
WITH CHECK (bucket_id = 'app-releases' AND public.is_admin());

DROP POLICY IF EXISTS "Al-islaam admins delete APK releases" ON storage.objects;
CREATE POLICY "Al-islaam admins delete APK releases"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'app-releases' AND public.is_admin());
