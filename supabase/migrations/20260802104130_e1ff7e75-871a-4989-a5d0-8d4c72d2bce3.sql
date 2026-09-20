DROP POLICY IF EXISTS app_releases_public_read ON public.app_releases;
REVOKE SELECT ON public.app_releases FROM anon;
CREATE POLICY app_releases_admin_read ON public.app_releases FOR SELECT TO authenticated USING (public.is_admin());