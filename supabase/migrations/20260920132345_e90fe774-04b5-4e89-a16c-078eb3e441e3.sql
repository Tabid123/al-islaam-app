-- Public catalog functions
CREATE OR REPLACE FUNCTION public.get_active_providers()
RETURNS TABLE (id uuid, provider_name text, provider_logo text, display_order integer, evoucher_rate numeric, promotional_text text, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.provider_name, p.provider_logo, p.display_order, p.evoucher_rate, p.promotional_text, p.is_active
  FROM public.providers_config p WHERE p.is_active ORDER BY p.display_order ASC
$$;

CREATE OR REPLACE FUNCTION public.get_active_categories(p_provider_id uuid DEFAULT NULL)
RETURNS TABLE (id uuid, category_name text, display_order integer, category_image text, provider_id uuid, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.category_name, c.display_order, c.category_image, c.provider_id, c.is_active
  FROM public.package_categories c
  WHERE c.is_active AND (p_provider_id IS NULL OR c.provider_id = p_provider_id)
  ORDER BY c.display_order ASC
$$;

CREATE OR REPLACE FUNCTION public.get_active_payment_providers()
RETURNS TABLE (id uuid, provider_name text, provider_logo text, commission_rate numeric, prefix_code text, ussd_code_template text, payment_number text, display_order integer, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.provider_name, p.provider_logo, p.commission_rate, p.prefix_code, p.ussd_code_template, p.payment_number, p.display_order, p.is_active
  FROM public.payment_providers_config p WHERE p.is_active ORDER BY p.display_order ASC
$$;

CREATE OR REPLACE FUNCTION public.get_public_packages(p_provider_id uuid DEFAULT NULL, p_category_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid, package_name text, data_amount text, validity_days text, selling_price numeric,
  connection_type_label text, category_id uuid, provider_id uuid, display_order integer,
  phone_prefix text, is_ussd_only boolean, is_discovery_root boolean, is_active boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, d.package_name, d.data_amount, d.validity_days, d.selling_price,
         d.connection_type_label, d.category_id, d.provider_id, d.display_order,
         d.phone_prefix, d.is_ussd_only, d.is_discovery_root, d.is_active
  FROM public.data_packages_config d
  WHERE d.is_active
    AND (p_provider_id IS NULL OR d.provider_id = p_provider_id)
    AND (p_category_id IS NULL OR d.category_id = p_category_id)
  ORDER BY d.display_order ASC
$$;

CREATE OR REPLACE FUNCTION public.get_public_packages_safe(p_provider_id uuid DEFAULT NULL, p_category_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid, package_name text, data_amount text, validity_days text, selling_price numeric,
  connection_type_label text, category_id uuid, provider_id uuid, display_order integer,
  phone_prefix text, is_ussd_only boolean, is_discovery_root boolean, is_active boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.get_public_packages(p_provider_id, p_category_id)
$$;

-- Customer functions
CREATE OR REPLACE FUNCTION public.is_phone_blocked(p_phone text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.blocked_users b WHERE b.phone_number = p_phone AND b.is_active)
$$;

CREATE OR REPLACE FUNCTION public.upsert_verified_phone_login(p_phone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.verified_phones (phone_number, last_login_at)
  VALUES (p_phone, now())
  ON CONFLICT (phone_number) DO UPDATE SET last_login_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.get_customer_order_history(customer_phone_number text)
RETURNS TABLE (
  id uuid, package_name text, data_amount text, selling_price numeric, receiver_phone text,
  status text, delivery_status text, provider_id uuid, package_id uuid, tx_id text,
  created_at timestamptz, delivered_at timestamptz, scheduled_for timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.package_name, o.data_amount, o.selling_price, o.receiver_phone,
         o.status, o.delivery_status, o.provider_id, o.package_id, o.tx_id,
         o.created_at, o.delivered_at, o.scheduled_for
  FROM public.orders o
  WHERE o.customer_phone = customer_phone_number OR o.sender_phone = customer_phone_number
  ORDER BY o.created_at DESC
  LIMIT 200
$$;

CREATE OR REPLACE FUNCTION public.get_customer_scheduled_orders(customer_phone_number text)
RETURNS TABLE (
  id uuid, package_name text, data_amount text, selling_price numeric, receiver_phone text,
  status text, scheduled_for timestamptz, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.package_name, o.data_amount, o.selling_price, o.receiver_phone,
         o.status, o.scheduled_for, o.created_at
  FROM public.orders o
  WHERE (o.customer_phone = customer_phone_number OR o.sender_phone = customer_phone_number)
    AND o.scheduled_for IS NOT NULL AND o.status <> 'cancelled'
  ORDER BY o.scheduled_for ASC
$$;

CREATE OR REPLACE FUNCTION public.cancel_scheduled_order(p_order_id uuid, customer_phone_number text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE updated_rows integer;
BEGIN
  UPDATE public.orders
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_order_id
    AND (customer_phone = customer_phone_number OR sender_phone = customer_phone_number)
    AND scheduled_for IS NOT NULL
    AND status NOT IN ('completed', 'cancelled');
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows > 0;
END; $$;

CREATE OR REPLACE FUNCTION public.retry_failed_order(p_order_id uuid, p_new_receiver_phone text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE updated_rows integer;
BEGIN
  UPDATE public.orders
  SET receiver_phone = p_new_receiver_phone, status = 'paid', delivery_status = 'pending', updated_at = now()
  WHERE id = p_order_id AND delivery_status IN ('failed', 'pending');
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  RETURN updated_rows > 0;
END; $$;

-- Referral functions
CREATE OR REPLACE FUNCTION public.get_my_referral_code(p_phone text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text;
BEGIN
  SELECT code INTO v_code FROM public.referral_codes WHERE phone = p_phone;
  IF v_code IS NULL THEN
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    INSERT INTO public.referral_codes (phone, code) VALUES (p_phone, v_code)
    ON CONFLICT (phone) DO UPDATE SET updated_at = now()
    RETURNING code INTO v_code;
  END IF;
  RETURN v_code;
END; $$;

CREATE OR REPLACE FUNCTION public.get_referral_summary(p_phone text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'code', coalesce((SELECT code FROM public.referral_codes WHERE phone = p_phone), ''),
    'points', coalesce((SELECT points FROM public.referral_codes WHERE phone = p_phone), 0),
    'earnings', coalesce((SELECT earnings FROM public.referral_codes WHERE phone = p_phone), 0),
    'total_referrals', coalesce((SELECT total_referrals FROM public.referral_codes WHERE phone = p_phone), 0),
    'recent', coalesce((
      SELECT jsonb_agg(jsonb_build_object('phone', referred_phone, 'points', points_awarded, 'created_at', created_at) ORDER BY created_at DESC)
      FROM (SELECT * FROM public.referral_redemptions WHERE referrer_phone = p_phone ORDER BY created_at DESC LIMIT 20) r
    ), '[]'::jsonb)
  )
$$;

CREATE OR REPLACE FUNCTION public.apply_referral_code(p_code text, p_new_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_referrer text;
BEGIN
  SELECT phone INTO v_referrer FROM public.referral_codes WHERE code = upper(p_code);
  IF v_referrer IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'invalid_code'); END IF;
  IF v_referrer = p_new_phone THEN RETURN jsonb_build_object('success', false, 'error', 'self_referral'); END IF;
  IF EXISTS (SELECT 1 FROM public.referral_redemptions WHERE referred_phone = p_new_phone) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_used');
  END IF;
  INSERT INTO public.referral_redemptions (referrer_phone, referred_phone, code_used)
  VALUES (v_referrer, p_new_phone, upper(p_code));
  UPDATE public.referral_codes
  SET points = points + 3, total_referrals = total_referrals + 1, earnings = earnings + 0.05, updated_at = now()
  WHERE phone = v_referrer;
  RETURN jsonb_build_object('success', true);
END; $$;

-- Admin helpers
CREATE OR REPLACE FUNCTION public.get_my_admin_context()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'user_id', auth.uid(),
    'is_admin', public.is_admin(),
    'roles', coalesce((SELECT jsonb_agg(role) FROM public.user_roles WHERE user_id = auth.uid()), '[]'::jsonb),
    'permissions', coalesce((SELECT jsonb_agg(permission_key) FROM public.admin_permissions WHERE user_id = auth.uid()), '[]'::jsonb)
  )
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_admin(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  DELETE FROM public.admin_permissions WHERE user_id = p_user_id;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_referral_overview()
RETURNS TABLE (phone text, code text, points integer, total_referrals integer, earnings numeric, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT r.phone, r.code, r.points, r.total_referrals, r.earnings, r.created_at
  FROM public.referral_codes r ORDER BY r.points DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_create_referral_code(p_phone text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN public.get_my_referral_code(p_phone);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_referral_code(p_phone text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  DELETE FROM public.referral_codes WHERE phone = p_phone;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_reset_referral_points(p_phone text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.referral_codes SET points = 0, earnings = 0, updated_at = now() WHERE phone = p_phone;
  RETURN true;
END; $$;

-- Admin analytics
CREATE OR REPLACE FUNCTION public.get_admin_analytics_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT jsonb_build_object(
    'total_orders', count(*),
    'completed_orders', count(*) FILTER (WHERE status = 'completed'),
    'pending_orders', count(*) FILTER (WHERE status <> 'completed'),
    'total_revenue', coalesce(sum(selling_price) FILTER (WHERE status = 'completed'), 0),
    'total_cost', coalesce(sum(cost_price) FILTER (WHERE status = 'completed'), 0),
    'total_profit', coalesce(sum(selling_price - cost_price) FILTER (WHERE status = 'completed'), 0),
    'today_orders', count(*) FILTER (WHERE created_at >= date_trunc('day', now())),
    'today_revenue', coalesce(sum(selling_price) FILTER (WHERE status = 'completed' AND created_at >= date_trunc('day', now())), 0)
  ) INTO result FROM public.orders;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.get_admin_provider_daily_stats(p_date text DEFAULT NULL)
RETURNS TABLE (provider_id uuid, provider_name text, order_count bigint, revenue numeric, profit numeric, day date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT p.id, p.provider_name, count(o.id),
         coalesce(sum(o.selling_price), 0), coalesce(sum(o.selling_price - o.cost_price), 0),
         (o.created_at AT TIME ZONE 'UTC')::date
  FROM public.providers_config p
  LEFT JOIN public.orders o ON o.provider_id = p.id AND o.status = 'completed'
    AND (p_date IS NULL OR (o.created_at AT TIME ZONE 'UTC')::date = p_date::date)
  GROUP BY p.id, p.provider_name, (o.created_at AT TIME ZONE 'UTC')::date
  ORDER BY 3 DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.get_admin_date_range_breakdown(p_start_date timestamptz DEFAULT NULL, p_end_date timestamptz DEFAULT NULL)
RETURNS TABLE (day date, order_count bigint, revenue numeric, profit numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT (o.created_at AT TIME ZONE 'UTC')::date, count(*),
         coalesce(sum(o.selling_price), 0), coalesce(sum(o.selling_price - o.cost_price), 0)
  FROM public.orders o
  WHERE o.status = 'completed'
    AND (p_start_date IS NULL OR o.created_at >= p_start_date)
    AND (p_end_date IS NULL OR o.created_at <= p_end_date)
  GROUP BY 1 ORDER BY 1;
END; $$;

CREATE OR REPLACE FUNCTION public.get_admin_reports(p_start timestamptz DEFAULT NULL, p_end timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT jsonb_build_object(
    'orders', count(*),
    'revenue', coalesce(sum(selling_price), 0),
    'cost', coalesce(sum(cost_price), 0),
    'profit', coalesce(sum(selling_price - cost_price), 0)
  ) INTO result FROM public.orders
  WHERE status = 'completed'
    AND (p_start IS NULL OR created_at >= p_start)
    AND (p_end IS NULL OR created_at <= p_end);
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.get_admin_transactions_summary(p_provider_id uuid DEFAULT NULL, p_period text DEFAULT 'all')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; v_since timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  v_since := CASE p_period
    WHEN 'today' THEN date_trunc('day', now())
    WHEN 'week' THEN now() - interval '7 days'
    WHEN 'month' THEN now() - interval '30 days'
    ELSE NULL END;
  SELECT jsonb_build_object(
    'total', count(*),
    'completed', count(*) FILTER (WHERE status = 'completed'),
    'failed', count(*) FILTER (WHERE delivery_status = 'failed'),
    'revenue', coalesce(sum(selling_price) FILTER (WHERE status = 'completed'), 0),
    'profit', coalesce(sum(selling_price - cost_price) FILTER (WHERE status = 'completed'), 0)
  ) INTO result FROM public.orders
  WHERE (p_provider_id IS NULL OR provider_id = p_provider_id)
    AND (v_since IS NULL OR created_at >= v_since);
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.get_admin_transactions_paginated(
  p_search text DEFAULT NULL, p_status text DEFAULT NULL, p_provider_id uuid DEFAULT NULL,
  p_period text DEFAULT 'all', p_page_size integer DEFAULT 20, p_page integer DEFAULT 1
)
RETURNS TABLE (
  id uuid, customer_phone text, receiver_phone text, package_name text, data_amount text,
  selling_price numeric, cost_price numeric, status text, delivery_status text,
  provider_id uuid, tx_id text, created_at timestamptz, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_since timestamptz;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  v_since := CASE p_period
    WHEN 'today' THEN date_trunc('day', now())
    WHEN 'week' THEN now() - interval '7 days'
    WHEN 'month' THEN now() - interval '30 days'
    ELSE NULL END;
  RETURN QUERY
  WITH filtered AS (
    SELECT o.* FROM public.orders o
    WHERE (p_provider_id IS NULL OR o.provider_id = p_provider_id)
      AND (p_status IS NULL OR p_status = 'all' OR o.status = p_status)
      AND (v_since IS NULL OR o.created_at >= v_since)
      AND (p_search IS NULL OR p_search = '' OR o.customer_phone ILIKE '%' || p_search || '%'
           OR o.receiver_phone ILIKE '%' || p_search || '%' OR o.tx_id ILIKE '%' || p_search || '%')
  )
  SELECT f.id, f.customer_phone, f.receiver_phone, f.package_name, f.data_amount,
         f.selling_price, f.cost_price, f.status, f.delivery_status,
         f.provider_id, f.tx_id, f.created_at, (SELECT count(*) FROM filtered)
  FROM filtered f
  ORDER BY f.created_at DESC
  LIMIT p_page_size OFFSET (greatest(p_page, 1) - 1) * p_page_size;
END; $$;

CREATE OR REPLACE FUNCTION public.set_bank_credential(p_username text, p_password text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  INSERT INTO public.bank_credentials (username, password_hash)
  VALUES (p_username, extensions.crypt(p_password, extensions.gen_salt('bf')))
  ON CONFLICT (username) DO UPDATE
    SET password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now();
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.check_fraud_rules(p_sender_phone text, p_amount numeric, p_receipt_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_recent integer;
BEGIN
  SELECT count(*) INTO v_recent FROM public.payment_receipts
  WHERE sender_phone = p_sender_phone AND created_at > now() - interval '10 minutes';
  IF v_recent > 5 THEN
    INSERT INTO public.fraud_alerts (sender_phone, amount, alert_type, severity, description)
    VALUES (p_sender_phone, p_amount, 'rapid_payments', 'high', 'More than 5 payments in 10 minutes');
    RETURN jsonb_build_object('flagged', true, 'reason', 'rapid_payments');
  END IF;
  RETURN jsonb_build_object('flagged', false);
END; $$;

-- USSD package discovery
CREATE OR REPLACE FUNCTION public.request_package_discovery(p_root_package_id uuid, p_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.ussd_package_discoveries (root_package_id, phone_number, status, expires_at)
  VALUES (p_root_package_id, p_phone, 'pending', now() + interval '5 minutes')
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'status', 'pending');
END; $$;

CREATE OR REPLACE FUNCTION public.get_package_discovery(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(d) FROM public.ussd_package_discoveries d WHERE d.id = p_id
$$;

CREATE OR REPLACE FUNCTION public.get_discovery_queue_status(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', d.id,
    'status', d.status,
    'session_state', d.session_state,
    'queued_at', d.queued_at,
    'position', (SELECT count(*) FROM public.ussd_package_discoveries q
                 WHERE q.status = 'pending' AND q.queued_at < d.queued_at)
  )
  FROM public.ussd_package_discoveries d WHERE d.id = p_id
$$;

CREATE OR REPLACE FUNCTION public.release_discovery_session(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.ussd_package_discoveries
  SET session_state = 'closed', session_device_id = NULL, session_expires_at = NULL, updated_at = now()
  WHERE id = p_id;
  RETURN true;
END; $$;

-- Execute grants: public functions for everyone, admin functions signed-in only
GRANT EXECUTE ON FUNCTION public.get_active_providers(), public.get_active_categories(uuid),
  public.get_active_payment_providers(), public.get_public_packages(uuid, uuid),
  public.get_public_packages_safe(uuid, uuid), public.is_phone_blocked(text),
  public.upsert_verified_phone_login(text), public.get_customer_order_history(text),
  public.get_customer_scheduled_orders(text), public.cancel_scheduled_order(uuid, text),
  public.retry_failed_order(uuid, text), public.get_my_referral_code(text),
  public.get_referral_summary(text), public.apply_referral_code(text, text),
  public.request_package_discovery(uuid, text), public.get_package_discovery(uuid),
  public.get_discovery_queue_status(uuid), public.release_discovery_session(uuid)
TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.check_fraud_rules(text, numeric, uuid) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_admin_context(), public.admin_remove_admin(uuid),
  public.admin_referral_overview(), public.admin_create_referral_code(text),
  public.admin_delete_referral_code(text), public.admin_reset_referral_points(text),
  public.get_admin_analytics_summary(), public.get_admin_provider_daily_stats(text),
  public.get_admin_date_range_breakdown(timestamptz, timestamptz), public.get_admin_reports(timestamptz, timestamptz),
  public.get_admin_transactions_summary(uuid, text),
  public.get_admin_transactions_paginated(text, text, uuid, text, integer, integer),
  public.set_bank_credential(text, text)
TO authenticated;