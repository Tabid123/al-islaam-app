CREATE OR REPLACE FUNCTION public.get_admin_reports(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  WITH base AS (
    SELECT o.*, COALESCE(p.provider_name,'Unknown') AS provider_name,
           COALESCE(p.evoucher_rate,0) AS evoucher_rate
    FROM public.orders o
    LEFT JOIN public.providers_config p ON p.id = o.provider_id
    WHERE o.created_at >= p_start AND o.created_at <= p_end
  ),
  ok AS (
    SELECT * FROM base WHERE status IN ('payment_confirmed','delivered')
  )
  SELECT jsonb_build_object(
    'total_orders', (SELECT COUNT(*) FROM base),
    'successful', (SELECT COUNT(*) FROM ok),
    'sent', (SELECT COUNT(*) FROM ok WHERE delivery_status = 'delivered'),
    'approved', (SELECT COUNT(*) FROM ok WHERE COALESCE(is_manual,false) = true),
    'failed', (SELECT COUNT(*) FROM base WHERE delivery_status = 'failed'),
    'pending', (SELECT COUNT(*) FROM base WHERE delivery_status = 'pending'),
    'received', (SELECT COALESCE(SUM(selling_price),0) FROM ok),
    'cost', (SELECT COALESCE(SUM(cost_price),0) FROM ok),
    'commission', (SELECT COALESCE(SUM(cost_price * evoucher_rate / 100.0),0) FROM ok),
    'by_company', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'received')::numeric DESC) FROM (
        SELECT jsonb_build_object('name', provider_name, 'count', COUNT(*),
          'received', COALESCE(SUM(selling_price),0), 'cost', COALESCE(SUM(cost_price),0),
          'commission', COALESCE(SUM(cost_price * evoucher_rate / 100.0),0)) AS x
        FROM ok GROUP BY provider_name) s), '[]'::jsonb),
    'by_status', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('status', COALESCE(delivery_status,'unknown'), 'count', COUNT(*),
          'amount', COALESCE(SUM(selling_price),0)) AS x
        FROM base GROUP BY delivery_status) s), '[]'::jsonb),
    'top_customers', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'total')::numeric DESC) FROM (
        SELECT jsonb_build_object('phone', customer_phone, 'orders', COUNT(*),
          'total', COALESCE(SUM(selling_price),0)) AS x
        FROM ok GROUP BY customer_phone ORDER BY SUM(selling_price) DESC LIMIT 20) s), '[]'::jsonb),
    'top_packages', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'sold')::int DESC) FROM (
        SELECT jsonb_build_object('name', package_name, 'price', MAX(selling_price),
          'cost', MAX(cost_price), 'sold', COUNT(*), 'total', COALESCE(SUM(selling_price),0)) AS x
        FROM ok GROUP BY package_name ORDER BY COUNT(*) DESC LIMIT 20) s), '[]'::jsonb),
    'payment_methods', COALESCE((SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('method', UPPER(COALESCE(payment_source,'unknown')), 'count', COUNT(*),
          'amount', COALESCE(SUM(selling_price),0)) AS x
        FROM ok GROUP BY payment_source) s), '[]'::jsonb),
    'staff', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'actions')::int DESC) FROM (
        SELECT jsonb_build_object('email', manual_action_email, 'actions', COUNT(*),
          'sent', COUNT(*) FILTER (WHERE delivery_status = 'delivered'),
          'cancelled', COUNT(*) FILTER (WHERE delivery_status IN ('failed','cancelled'))) AS x
        FROM base WHERE manual_action_email IS NOT NULL GROUP BY manual_action_email) s), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END; $$;

REVOKE ALL ON FUNCTION public.get_admin_reports(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_reports(timestamptz, timestamptz) TO authenticated;