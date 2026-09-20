-- Iftin parity for Riyokaab production.
-- Secret/Only-Me prices stay admin-only; public catalog is explicitly projected.
-- Profit rule:
--   interactive USSD flows (*870*, *866*, *101*, *212*) => selling - cost
--   all other orders => Riyokaab e-voucher formula: selling * (1 + rate) - cost

ALTER TABLE public.data_packages_config
  ADD COLUMN IF NOT EXISTS secret_price numeric,
  ADD COLUMN IF NOT EXISTS secret_prices numeric[] NOT NULL DEFAULT '{}'::numeric[];

UPDATE public.data_packages_config
SET secret_prices = ARRAY[secret_price]::numeric[]
WHERE secret_price IS NOT NULL
  AND cardinality(secret_prices) = 0;

CREATE INDEX IF NOT EXISTS idx_data_packages_secret_price
  ON public.data_packages_config (provider_id, secret_price)
  WHERE secret_price IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_data_packages_secret_prices
  ON public.data_packages_config USING GIN (secret_prices);

CREATE OR REPLACE FUNCTION public.get_public_packages_safe(p_provider_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', dp.id,
        'package_name', dp.package_name,
        'data_amount', dp.data_amount,
        'validity_days', dp.validity_days,
        'selling_price', dp.selling_price,
        'cost_price', dp.cost_price,
        'is_active', dp.is_active,
        'category_id', dp.category_id,
        'provider_id', dp.provider_id,
        'connection_type_label', dp.connection_type_label,
        'ussd_code', dp.ussd_code,
        'display_order', dp.display_order,
        'phone_prefix', dp.phone_prefix,
        'menu1', dp.menu1,
        'menu2', dp.menu2,
        'somlink_bundle_id', dp.somlink_bundle_id,
        'is_ussd_only', dp.is_ussd_only,
        'is_discovery_root', dp.is_discovery_root
      )
      ORDER BY dp.display_order, dp.selling_price
    ),
    '[]'::jsonb
  )
  FROM public.data_packages_config dp
  WHERE dp.is_active = true
    AND dp.provider_id = p_provider_id
    AND dp.is_ussd_only = false;
$$;

REVOKE ALL ON FUNCTION public.get_public_packages(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_public_packages(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_packages_safe(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.riyokaab_is_flow_order(
  p_order_id uuid,
  p_package_id uuid,
  p_discovery_root_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p_discovery_root_id IS NOT NULL
    OR COALESCE((
      SELECT dp.is_discovery_root
      FROM public.data_packages_config dp
      WHERE dp.id = p_package_id
    ), false)
    OR EXISTS (
      SELECT 1
      FROM public.delivery_queue dq
      WHERE dq.order_id = p_order_id
        AND (
          btrim(COALESCE(dq.ussd_code, '')) LIKE '*870*%'
          OR btrim(COALESCE(dq.ussd_code, '')) LIKE '*866*%'
          OR btrim(COALESCE(dq.ussd_code, '')) LIKE '*212*%'
          OR btrim(COALESCE(dq.ussd_code, '')) LIKE '*101*%'
          OR btrim(COALESCE(dq.ussd_code, '')) LIKE '*101#%'
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.riyokaab_profit_amount(
  p_selling numeric,
  p_cost numeric,
  p_rate numeric,
  p_is_flow boolean
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_is_flow, false)
      THEN COALESCE(p_selling, 0) - COALESCE(p_cost, 0)
    ELSE
      (COALESCE(p_selling, 0) * (1 + COALESCE(p_rate, 0))) - COALESCE(p_cost, 0)
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_analytics_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  WITH base AS (
    SELECT
      o.id,
      o.package_id,
      o.discovery_root_id,
      o.provider_id,
      o.selling_price,
      o.cost_price,
      COALESCE(pc.evoucher_rate, 0) AS rate,
      public.riyokaab_is_flow_order(o.id, o.package_id, o.discovery_root_id) AS is_flow,
      o.status,
      o.delivery_status,
      o.created_at
    FROM public.orders o
    LEFT JOIN public.providers_config pc ON pc.id = o.provider_id
  ),
  agg AS (
    SELECT
      COALESCE(SUM(selling_price) FILTER (WHERE status IN ('payment_confirmed','delivered')), 0) AS total_revenue,
      COALESCE(SUM(cost_price) FILTER (WHERE status IN ('payment_confirmed','delivered')), 0) AS total_cost,
      COALESCE(SUM(public.riyokaab_profit_amount(selling_price,cost_price,rate,is_flow))
        FILTER (WHERE status IN ('payment_confirmed','delivered')), 0) AS total_profit,
      COUNT(*) FILTER (WHERE status IN ('payment_confirmed','delivered')) AS total_orders,
      COUNT(*) FILTER (WHERE delivery_status = 'delivered') AS delivered_orders,
      COUNT(*) FILTER (WHERE delivery_status = 'pending') AS pending_orders,
      COUNT(*) FILTER (WHERE delivery_status = 'failed') AS failed_orders
    FROM base
  ),
  period AS (
    SELECT
      p.label,
      COALESCE(SUM(b.selling_price) FILTER (WHERE b.status IN ('payment_confirmed','delivered')), 0) AS revenue,
      COALESCE(SUM(b.cost_price) FILTER (WHERE b.status IN ('payment_confirmed','delivered')), 0) AS cost,
      COALESCE(SUM(public.riyokaab_profit_amount(b.selling_price,b.cost_price,b.rate,b.is_flow))
        FILTER (WHERE b.status IN ('payment_confirmed','delivered')), 0) AS profit,
      COUNT(*) FILTER (WHERE b.status IN ('payment_confirmed','delivered')) AS orders,
      COUNT(*) FILTER (WHERE b.delivery_status = 'pending') AS pending,
      COUNT(*) FILTER (WHERE b.delivery_status = 'failed') AS failed,
      COUNT(*) FILTER (WHERE b.delivery_status = 'delivered') AS delivered
    FROM (
      VALUES
        ('today', date_trunc('day', now())),
        ('week', date_trunc('week', now())),
        ('month', date_trunc('month', now())),
        ('year', date_trunc('year', now()))
    ) AS p(label, start_at)
    LEFT JOIN base b ON b.created_at >= p.start_at
    GROUP BY p.label
  )
  SELECT jsonb_build_object(
    'total_revenue', a.total_revenue,
    'total_cost', a.total_cost,
    'total_profit', a.total_profit,
    'total_orders', a.total_orders,
    'delivered_orders', a.delivered_orders,
    'pending_orders', a.pending_orders,
    'failed_orders', a.failed_orders,
    'today', (SELECT to_jsonb(x) - 'label' FROM period x WHERE label='today'),
    'week', (SELECT to_jsonb(x) - 'label' FROM period x WHERE label='week'),
    'month', (SELECT to_jsonb(x) - 'label' FROM period x WHERE label='month'),
    'year', (SELECT to_jsonb(x) - 'label' FROM period x WHERE label='year')
  )
  INTO result
  FROM agg a;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_transactions_summary(
  p_provider_id uuid DEFAULT NULL::uuid,
  p_period text DEFAULT 'all'::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  since timestamptz;
  result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  since := CASE p_period
    WHEN 'today' THEN date_trunc('day', now())
    WHEN 'week' THEN date_trunc('week', now())
    WHEN 'month' THEN date_trunc('month', now())
    WHEN 'year' THEN date_trunc('year', now())
    ELSE '1970-01-01'::timestamptz
  END;

  WITH scoped AS (
    SELECT
      o.*,
      COALESCE(pc.evoucher_rate,0) AS rate,
      public.riyokaab_is_flow_order(o.id,o.package_id,o.discovery_root_id) AS is_flow
    FROM public.orders o
    LEFT JOIN public.providers_config pc ON pc.id=o.provider_id
    WHERE o.created_at >= since
      AND (p_provider_id IS NULL OR o.provider_id=p_provider_id)
      AND o.status IN ('payment_confirmed','delivered')
  )
  SELECT jsonb_build_object(
    'total_orders', COUNT(*),
    'total_revenue', COALESCE(SUM(selling_price),0),
    'total_cost', COALESCE(SUM(cost_price),0),
    'total_profit', COALESCE(SUM(public.riyokaab_profit_amount(selling_price,cost_price,rate,is_flow)),0),
    'delivered', COUNT(*) FILTER (WHERE delivery_status='delivered'),
    'pending', COUNT(*) FILTER (WHERE delivery_status='pending'),
    'failed', COUNT(*) FILTER (WHERE delivery_status='failed')
  )
  INTO result
  FROM scoped;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_transactions_paginated(
  p_search text DEFAULT ''::text,
  p_status text DEFAULT 'all'::text,
  p_provider_id text DEFAULT 'all'::text,
  p_period text DEFAULT 'all'::text,
  p_page_size integer DEFAULT 25,
  p_page integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  since timestamptz;
  provider_uuid uuid;
  rows_json jsonb;
  total bigint;
  sum_sales numeric;
  sum_profit numeric;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  since := CASE p_period
    WHEN 'today' THEN date_trunc('day', now())
    WHEN 'week' THEN date_trunc('week', now())
    WHEN 'month' THEN date_trunc('month', now())
    WHEN 'year' THEN date_trunc('year', now())
    ELSE '1970-01-01'::timestamptz
  END;

  provider_uuid := CASE WHEN p_provider_id='all' OR p_provider_id IS NULL THEN NULL ELSE p_provider_id::uuid END;

  WITH filtered AS (
    SELECT
      o.*,
      COALESCE(pc.evoucher_rate,0) AS evoucher_rate,
      COALESCE(pc.provider_name,'Unknown') AS provider_name,
      public.riyokaab_is_flow_order(o.id,o.package_id,o.discovery_root_id) AS is_flow
    FROM public.orders o
    LEFT JOIN public.providers_config pc ON pc.id=o.provider_id
    WHERE o.created_at >= since
      AND (provider_uuid IS NULL OR o.provider_id=provider_uuid)
      AND (p_status='all' OR o.delivery_status=p_status)
      AND (
        p_search IS NULL OR p_search='' OR
        o.customer_phone ILIKE '%'||p_search||'%' OR
        o.receiver_phone ILIKE '%'||p_search||'%' OR
        COALESCE(o.tx_id,'') ILIKE '%'||p_search||'%' OR
        o.package_name ILIKE '%'||p_search||'%'
      )
  ),
  totals AS (
    SELECT
      COUNT(*) AS total_count,
      COALESCE(SUM(selling_price),0) AS total_sales,
      COALESCE(SUM(public.riyokaab_profit_amount(selling_price,cost_price,evoucher_rate,is_flow)),0) AS total_profit
    FROM filtered
  ),
  page AS (
    SELECT * FROM filtered
    ORDER BY created_at DESC
    LIMIT p_page_size OFFSET (p_page*p_page_size)
  )
  SELECT
    (SELECT total_count FROM totals),
    (SELECT total_sales FROM totals),
    (SELECT total_profit FROM totals),
    COALESCE(jsonb_agg(to_jsonb(page.*)), '[]'::jsonb)
  INTO total,sum_sales,sum_profit,rows_json
  FROM page;

  RETURN jsonb_build_object(
    'rows', rows_json,
    'total_count', total,
    'total_sales', sum_sales,
    'total_profit', sum_profit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_provider_daily_stats(p_date date DEFAULT NULL::date)
RETURNS TABLE(
  provider_id uuid,
  provider_name text,
  evoucher_rate numeric,
  order_count bigint,
  revenue numeric,
  cost numeric,
  profit numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH day AS (
    SELECT COALESCE(p_date, (now() AT TIME ZONE 'UTC')::date) AS d
  )
  SELECT
    p.id AS provider_id,
    p.provider_name,
    p.evoucher_rate,
    COUNT(o.id) AS order_count,
    COALESCE(SUM(o.selling_price),0) AS revenue,
    COALESCE(SUM(o.cost_price),0) AS cost,
    COALESCE(SUM(public.riyokaab_profit_amount(
      o.selling_price,
      o.cost_price,
      COALESCE(p.evoucher_rate,0),
      public.riyokaab_is_flow_order(o.id,o.package_id,o.discovery_root_id)
    )),0) AS profit
  FROM public.providers_config p
  CROSS JOIN day
  LEFT JOIN public.orders o
    ON o.provider_id=p.id
    AND o.status IN ('payment_confirmed','delivered')
    AND o.created_at::date=day.d
  GROUP BY p.id,p.provider_name,p.evoucher_rate
  ORDER BY p.display_order;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_date_range_breakdown(
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_provider_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  provider_id uuid,
  provider_name text,
  order_count bigint,
  revenue numeric,
  cost numeric,
  profit numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id AS provider_id,
    p.provider_name,
    COUNT(o.id) AS order_count,
    COALESCE(SUM(o.selling_price),0) AS revenue,
    COALESCE(SUM(o.cost_price),0) AS cost,
    COALESCE(SUM(public.riyokaab_profit_amount(
      o.selling_price,
      o.cost_price,
      COALESCE(p.evoucher_rate,0),
      public.riyokaab_is_flow_order(o.id,o.package_id,o.discovery_root_id)
    )),0) AS profit
  FROM public.providers_config p
  LEFT JOIN public.orders o
    ON o.provider_id=p.id
    AND o.status IN ('payment_confirmed','delivered')
    AND o.created_at>=p_start_date
    AND o.created_at<=p_end_date
  WHERE p_provider_id IS NULL OR p.id=p_provider_id
  GROUP BY p.id,p.provider_name,p.display_order
  ORDER BY p.display_order;
$$;
