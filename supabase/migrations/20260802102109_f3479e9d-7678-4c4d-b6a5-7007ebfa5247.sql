CREATE TABLE public.app_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_key text NOT NULL,
  app_name text NOT NULL,
  version text NOT NULL,
  release_notes text,
  file_path text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_releases TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_releases TO authenticated;
GRANT ALL ON public.app_releases TO service_role;

ALTER TABLE public.app_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_releases_public_read" ON public.app_releases
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "app_releases_admin_write" ON public.app_releases
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TRIGGER update_app_releases_updated_at
  BEFORE UPDATE ON public.app_releases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "app_releases_admin_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'app-releases' AND public.is_admin());

CREATE POLICY "app_releases_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'app-releases' AND public.is_admin());

CREATE POLICY "app_releases_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'app-releases' AND public.is_admin());

CREATE POLICY "app_releases_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'app-releases' AND public.is_admin());