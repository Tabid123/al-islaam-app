-- Fix Simple Admin financial reporting and order cost snapshots.
-- Legacy zero-cost orders are NOT rewritten; reports fall back to the package cost.
-- New/updated orders snapshot package cost when cost_price is missing/zero.

CREATE OR REPLACE FUNCTION public.riyokaab_effective_order_cost(
  p_order_cost numeric,
  p_package_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN COALESCE(p_order_cost, 0) > 0 THEN p_order_cost
    WHEN p_package_id IS NOT NULL THEN COALESCE((
      SELECT dp.cost_price
      FROM public.data_packages_config dp
      WHERE dp.id = p_package_id
    ), 0)
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.riyokaab_fill_order_cost_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  package_cost numeric;
BEGIN
  IF COALESCE(NEW.cost_price, 0) <= 0 AND NEW.package_id IS NOT NULL THEN
    SELECT dp.cost_price INTO package_cost
    FROM public.data_packages_config dp
    WHERE dp.id = NEW.package_id;

    IF COALESCE(package_cost, 0) > 0 THEN
      NEW.cost_price := package_cost;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_riyokaab_fill_order_cost_snapshot ON public.orders;
CREATE TRIGGER trg_riyokaab_fill_order_cost_snapshot
BEFORE INSERT OR UPDATE OF package_id, cost_price ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.riyokaab_fill_order_cost_snapshot();

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
      public.riyokaab_effective_order_cost(o.cost_price, o.package_id) AS effective_cost,
      COALESCE(pc.evoucher_rate, 0) AS rate,
      public.riyokaab_is_flow_order(o.id, o.package_id, o.discovery_root_id) AS is_flow,
      lower(COALESCE(o.status, '')) AS order_status,
      lower(COALESCE(o.delivery_status, '')) AS delivery_status,
      o.created_at,
      (
        lower(COALESCE(o.status, '')) IN ('completed','paid','payment_confirmed','delivered')
        OR lower(COALESCE(o.delivery_status, '')) = 'delivered'
      ) AND lower(COALESCE(o.status, '')) NOT IN ('cancelled','canceled') AS is_financial
    FROM public.orders o
    LEFT JOIN public.providers_config pc ON pc.id = o.provider_id
  ),
  agg AS (
    SELECT
      COALESCE(SUM(selling_price) FILTER (WHERE is_financial), 0) AS total_revenue,
      COALESCE(SUM(effective_cost) FILTER (WHERE is_financial), 0) AS total_cost,
      COALESCE(SUM(public.riyokaab_profit_amount(selling_price,effective_cost,rate,is_flow))
        FILTER (WHERE is_financial), 0) AS total_profit,
      COUNT(*) FILTER (WHERE is_financial) AS total_orders,
      COUNT(*) FILTER (WHERE is_financial AND delivery_status = 'delivered') AS delivered_orders,
      COUNT(*) FILTER (WHERE is_financial AND delivery_status IN ('pending','processing','queued','scheduled')) AS pending_orders,
      COUNT(*) FILTER (WHERE is_financial AND delivery_status IN ('failed','timeout')) AS failed_orders
    FROM base
  ),
  periods AS (
    SELECT * FROM (VALUES
      ('today'::text,  date_trunc('day',   now() AT TIME ZONE 'Africa/Mogadishu') AT TIME ZONE 'Africa/Mogadishu'),
      ('week'::text,   date_trunc('week',  now() AT TIME ZONE 'Africa/Mogadishu') AT TIME ZONE 'Africa/Mogadishu'),
      ('month'::text,  date_trunc('month', now() AT TIME ZONE 'Africa/Mogadishu') AT TIME ZONE 'Africa/Mogadishu'),
      ('year'::text,   date_trunc('year',  now() AT TIME ZONE 'Africa/Mogadishu') AT TIME ZONE 'Africa/Mogadishu')
    ) AS p(label, start_at)
  ),
  period_agg AS (
    SELECT
      p.label,
      COALESCE(SUM(b.selling_price) FILTER (WHERE b.is_financial), 0) AS revenue,
      COALESCE(SUM(b.effective_cost) FILTER (WHERE b.is_financial), 0) AS cost,
      COALESCE(SUM(public.riyokaab_profit_amount(b.selling_price,b.effective_cost,b.rate,b.is_flow))
        FILTER (WHERE b.is_financial), 0) AS profit,
      COUNT(*) FILTER (WHERE b.is_financial) AS orders,
      COUNT(*) FILTER (WHERE b.is_financial AND b.delivery_status = 'delivered') AS delivered,
      COUNT(*) FILTER (WHERE b.is_financial AND b.delivery_status IN ('pending','processing','queued','scheduled')) AS pending,
      COUNT(*) FILTER (WHERE b.is_financial AND b.delivery_status IN ('failed','timeout')) AS failed
    FROM periods p
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
    'today', (SELECT to_jsonb(x) - 'label' FROM period_agg x WHERE label='today'),
    'week', (SELECT to_jsonb(x) - 'label' FROM period_agg x WHERE label='week'),
    'month', (SELECT to_jsonb(x) - 'label' FROM period_agg x WHERE label='month'),
    'year', (SELECT to_jsonb(x) - 'label' FROM period_agg x WHERE label='year')
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
    WHEN 'today' THEN date_trunc('day', now() AT TIME ZONE 'Africa/Mogadishu') AT TIME ZONE 'Africa/Mogadishu'
    WHEN 'week' THEN date_trunc('week', now() AT TIME ZONE 'Africa/Mogadishu') AT TIME ZONE 'Africa/Mogadishu'
    WHEN 'month' THEN date_trunc('month', now() AT TIME ZONE 'Africa/Mogadishu') AT TIME ZONE 'Africa/Mogadishu'
    WHEN 'year' THEN date_trunc('year', now() AT TIME ZONE 'Africa/Mogadishu') AT TIME ZONE 'Africa/Mogadishu'
    ELSE '1970-01-01'::timestamptz
  END;

  WITH scoped AS (
    SELECT
      o.*,
      public.riyokaab_effective_order_cost(o.cost_price,o.package_id) AS effective_cost,
      COALESCE(pc.evoucher_rate,0) AS rate,
      public.riyokaab_is_flow_order(o.id,o.package_id,o.discovery_root_id) AS is_flow
    FROM public.orders o
    LEFT JOIN public.providers_config pc ON pc.id=o.provider_id
    WHERE o.created_at >= since
      AND (p_provider_id IS NULL OR o.provider_id=p_provider_id)
      AND (
        lower(COALESCE(o.status,'')) IN ('completed','paid','payment_confirmed','delivered')
        OR lower(COALESCE(o.delivery_status,''))='delivered'
      )
      AND lower(COALESCE(o.status,'')) NOT IN ('cancelled','canceled')
  )
  SELECT jsonb_build_object(
    'total_orders', COUNT(*),
    'total_revenue', COALESCE(SUM(selling_price),0),
    'total_cost', COALESCE(SUM(effective_cost),0),
    'total_profit', COALESCE(SUM(public.riyokaab_profit_amount(selling_price,effective_cost,rate,is_flow)),0),
    'delivered', COUNT(*) FILTER (WHERE lower(COALESCE(delivery_status,''))='delivered'),
    'pending', COUNT(*) FILTER (WHERE lower(COALESCE(delivery_status,'')) IN ('pending','processing','queued','scheduled')),
    'failed', COUNT(*) FILTER (WHERE lower(COALESCE(delivery_status,'')) IN ('failed','timeout'))
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
    WHEN 'today' THEN date_trunc('day', now() AT TIME ZONE 'Africa/Mogadishu') AT TIME ZONE 'Africa/Mogadishu'
    WHEN 'week' THEN date_trunc('week', now() AT TIME ZONE 'Africa/Mogadishu') AT TIME ZONE 'Africa/Mogadishu'
    WHEN 'month' THEN date_trunc('month', now() AT TIME ZONE 'Africa/Mogadishu') AT TIME ZONE 'Africa/Mogadishu'
    WHEN 'year' THEN date_trunc('year', now() AT TIME ZONE 'Africa/Mogadishu') AT TIME ZONE 'Africa/Mogadishu'
    ELSE '1970-01-01'::timestamptz
  END;

  provider_uuid := CASE WHEN p_provider_id='all' OR p_provider_id IS NULL THEN NULL ELSE p_provider_id::uuid END;

  WITH filtered AS (
    SELECT
      o.*,
      public.riyokaab_effective_order_cost(o.cost_price,o.package_id) AS effective_cost,
      COALESCE(pc.evoucher_rate,0) AS evoucher_rate,
      COALESCE(pc.provider_name,'Unknown') AS provider_name,
      public.riyokaab_is_flow_order(o.id,o.package_id,o.discovery_root_id) AS is_flow,
      (
        lower(COALESCE(o.status,'')) IN ('completed','paid','payment_confirmed','delivered')
        OR lower(COALESCE(o.delivery_status,''))='delivered'
      ) AND lower(COALESCE(o.status,'')) NOT IN ('cancelled','canceled') AS is_financial
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
      COALESCE(SUM(selling_price) FILTER (WHERE is_financial),0) AS total_sales,
      COALESCE(SUM(public.riyokaab_profit_amount(selling_price,effective_cost,evoucher_rate,is_flow))
        FILTER (WHERE is_financial),0) AS total_profit
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
    COALESCE(
      jsonb_agg(
        to_jsonb(page.*) || jsonb_build_object('cost_price', page.effective_cost)
      ),
      '[]'::jsonb
    )
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
    SELECT COALESCE(p_date, (now() AT TIME ZONE 'Africa/Mogadishu')::date) AS d
  )
  SELECT
    p.id AS provider_id,
    p.provider_name,
    p.evoucher_rate,
    COUNT(o.id) AS order_count,
    COALESCE(SUM(o.selling_price),0) AS revenue,
    COALESCE(SUM(public.riyokaab_effective_order_cost(o.cost_price,o.package_id)),0) AS cost,
    COALESCE(SUM(public.riyokaab_profit_amount(
      o.selling_price,
      public.riyokaab_effective_order_cost(o.cost_price,o.package_id),
      COALESCE(p.evoucher_rate,0),
      public.riyokaab_is_flow_order(o.id,o.package_id,o.discovery_root_id)
    )),0) AS profit
  FROM public.providers_config p
  CROSS JOIN day
  LEFT JOIN public.orders o
    ON o.provider_id=p.id
    AND (
      lower(COALESCE(o.status,'')) IN ('completed','paid','payment_confirmed','delivered')
      OR lower(COALESCE(o.delivery_status,''))='delivered'
    )
    AND lower(COALESCE(o.status,'')) NOT IN ('cancelled','canceled')
    AND (o.created_at AT TIME ZONE 'Africa/Mogadishu')::date=day.d
  GROUP BY p.id,p.provider_name,p.evoucher_rate,p.display_order
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
    COALESCE(SUM(public.riyokaab_effective_order_cost(o.cost_price,o.package_id)),0) AS cost,
    COALESCE(SUM(public.riyokaab_profit_amount(
      o.selling_price,
      public.riyokaab_effective_order_cost(o.cost_price,o.package_id),
      COALESCE(p.evoucher_rate,0),
      public.riyokaab_is_flow_order(o.id,o.package_id,o.discovery_root_id)
    )),0) AS profit
  FROM public.providers_config p
  LEFT JOIN public.orders o
    ON o.provider_id=p.id
    AND (
      lower(COALESCE(o.status,'')) IN ('completed','paid','payment_confirmed','delivered')
      OR lower(COALESCE(o.delivery_status,''))='delivered'
    )
    AND lower(COALESCE(o.status,'')) NOT IN ('cancelled','canceled')
    AND o.created_at>=p_start_date
    AND o.created_at<=p_end_date
  WHERE p_provider_id IS NULL OR p.id=p_provider_id
  GROUP BY p.id,p.provider_name,p.display_order
  ORDER BY p.display_order;
$$;
