
-- STORAGE lockdown
DROP POLICY IF EXISTS "Anon write banners" ON storage.objects;
DROP POLICY IF EXISTS "Anon write error-icons" ON storage.objects;
DROP POLICY IF EXISTS "Anon write provider-logos" ON storage.objects;
DROP POLICY IF EXISTS "Auth write banners" ON storage.objects;
DROP POLICY IF EXISTS "Auth write error-icons" ON storage.objects;
DROP POLICY IF EXISTS "Auth write provider-logos" ON storage.objects;
DROP POLICY IF EXISTS "Auth update banners" ON storage.objects;
DROP POLICY IF EXISTS "Auth update error-icons" ON storage.objects;
DROP POLICY IF EXISTS "Auth update provider-logos" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete banners" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete error-icons" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete provider-logos" ON storage.objects;

DROP POLICY IF EXISTS "Admins can upload provider-logos" ON storage.objects;
CREATE POLICY "Admins can upload provider-logos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'provider-logos' AND public.is_admin());
DROP POLICY IF EXISTS "Admins can update provider-logos" ON storage.objects;
CREATE POLICY "Admins can update provider-logos" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'provider-logos' AND public.is_admin());
DROP POLICY IF EXISTS "Admins can delete provider-logos" ON storage.objects;
CREATE POLICY "Admins can delete provider-logos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'provider-logos' AND public.is_admin());

DROP POLICY IF EXISTS "Admins can upload error-icons" ON storage.objects;
CREATE POLICY "Admins can upload error-icons" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'error-icons' AND public.is_admin());
DROP POLICY IF EXISTS "Admins can update error-icons" ON storage.objects;
CREATE POLICY "Admins can update error-icons" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'error-icons' AND public.is_admin());
DROP POLICY IF EXISTS "Admins can delete error-icons" ON storage.objects;
CREATE POLICY "Admins can delete error-icons" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'error-icons' AND public.is_admin());

-- Drop wide-open data policies
DROP POLICY IF EXISTS "verified_phones public insert" ON public.verified_phones;
DROP POLICY IF EXISTS "verified_phones public update login" ON public.verified_phones;
DROP POLICY IF EXISTS "offline_reg public insert" ON public.offline_registrations;
DROP POLICY IF EXISTS "offline_reg public update" ON public.offline_registrations;
DROP POLICY IF EXISTS "orders public offline insert" ON public.orders;
DROP POLICY IF EXISTS "Anyone can view referral codes" ON public.referral_codes;
DROP POLICY IF EXISTS "Anyone can insert own referral code" ON public.referral_codes;
DROP POLICY IF EXISTS "Anyone can view redemptions" ON public.referral_redemptions;
DROP POLICY IF EXISTS "Anyone can insert redemption" ON public.referral_redemptions;
DROP POLICY IF EXISTS "bulk_sms_campaigns apk read message" ON public.bulk_sms_campaigns;
DROP POLICY IF EXISTS "bulk_sms_queue apk read pending" ON public.bulk_sms_queue;
DROP POLICY IF EXISTS "bulk_sms_queue apk update status" ON public.bulk_sms_queue;
DROP POLICY IF EXISTS "data_packages public read" ON public.data_packages_config;

-- Admin-only SELECT policies for referral tables (RPCs use SECURITY DEFINER for anon reads)
DROP POLICY IF EXISTS "Admins view referral codes" ON public.referral_codes;
CREATE POLICY "Admins view referral codes" ON public.referral_codes
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Admins view referral redemptions" ON public.referral_redemptions;
CREATE POLICY "Admins view referral redemptions" ON public.referral_redemptions
  FOR SELECT TO authenticated USING (public.is_admin());

-- Tighten always-true INSERT policies
DROP POLICY IF EXISTS "audit_logs authenticated insert" ON public.audit_logs;
CREATE POLICY "audit_logs authenticated insert" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (
    action IS NOT NULL AND length(action) > 0
    AND table_name IS NOT NULL AND length(table_name) > 0
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Anyone can insert acquisition source" ON public.user_acquisition_sources;
CREATE POLICY "Anyone can insert acquisition source" ON public.user_acquisition_sources
  FOR INSERT TO anon, authenticated WITH CHECK (
    phone_number IS NOT NULL AND length(regexp_replace(phone_number,'\D','','g')) >= 9
    AND source IS NOT NULL AND length(source) BETWEEN 1 AND 64
  );

-- Revoke anon EXECUTE on admin-only functions + add internal is_admin guard
REVOKE ALL ON FUNCTION public.get_admin_analytics_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_analytics_summary() TO authenticated;
REVOKE ALL ON FUNCTION public.get_admin_provider_daily_stats(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_provider_daily_stats(date) TO authenticated;
REVOKE ALL ON FUNCTION public.get_admin_date_range_breakdown(timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_date_range_breakdown(timestamptz, timestamptz, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_admin_transactions_summary(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_transactions_summary(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_admin_transactions_paginated(text, text, text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_transactions_paginated(text, text, text, text, int, int) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_reset_referral_points(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_referral_points(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_analytics_summary()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  WITH base AS (SELECT o.selling_price, o.cost_price, o.status, o.delivery_status, o.created_at FROM public.orders o),
  agg AS (SELECT
      COALESCE(SUM(selling_price) FILTER (WHERE status IN ('payment_confirmed','delivered')), 0) AS total_revenue,
      COALESCE(SUM(cost_price) FILTER (WHERE status IN ('payment_confirmed','delivered')), 0) AS total_cost,
      COUNT(*) FILTER (WHERE status IN ('payment_confirmed','delivered')) AS total_orders,
      COUNT(*) FILTER (WHERE delivery_status = 'delivered') AS delivered_orders,
      COUNT(*) FILTER (WHERE delivery_status = 'pending') AS pending_orders,
      COUNT(*) FILTER (WHERE delivery_status = 'failed') AS failed_orders FROM base),
  period AS (SELECT p.label,
      COALESCE(SUM(b.selling_price) FILTER (WHERE b.status IN ('payment_confirmed','delivered')), 0) AS revenue,
      COALESCE(SUM(b.cost_price) FILTER (WHERE b.status IN ('payment_confirmed','delivered')), 0) AS cost,
      COUNT(*) FILTER (WHERE b.status IN ('payment_confirmed','delivered')) AS orders,
      COUNT(*) FILTER (WHERE b.delivery_status = 'pending') AS pending,
      COUNT(*) FILTER (WHERE b.delivery_status = 'failed') AS failed,
      COUNT(*) FILTER (WHERE b.delivery_status = 'delivered') AS delivered
    FROM (VALUES ('today', date_trunc('day', now())),('week',  date_trunc('week', now())),
                 ('month', date_trunc('month', now())),('year',  date_trunc('year', now()))) AS p(label, start_at)
    LEFT JOIN base b ON b.created_at >= p.start_at GROUP BY p.label)
  SELECT jsonb_build_object(
    'total_revenue', a.total_revenue,'total_cost', a.total_cost,
    'total_profit', a.total_revenue - a.total_cost,'total_orders', a.total_orders,
    'delivered_orders', a.delivered_orders,'pending_orders', a.pending_orders,'failed_orders', a.failed_orders,
    'today', (SELECT to_jsonb(x) - 'label' || jsonb_build_object('profit', x.revenue - x.cost) FROM period x WHERE label='today'),
    'week',  (SELECT to_jsonb(x) - 'label' || jsonb_build_object('profit', x.revenue - x.cost) FROM period x WHERE label='week'),
    'month', (SELECT to_jsonb(x) - 'label' || jsonb_build_object('profit', x.revenue - x.cost) FROM period x WHERE label='month'),
    'year',  (SELECT to_jsonb(x) - 'label' || jsonb_build_object('profit', x.revenue - x.cost) FROM period x WHERE label='year')
  ) INTO result FROM agg a;
  RETURN result;
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_reset_referral_points(p_phone text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.referral_codes SET points = 0, updated_at = now() WHERE phone = p_phone;
  RETURN json_build_object('success', true);
END; $function$;
