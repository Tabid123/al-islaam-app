-- Restore Riyokaab runtime RPC parity required by Al-islaam.
-- Generated from the verified live Al-islaam database after parity restoration.

CREATE OR REPLACE FUNCTION public.check_referral_code_exists(p_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS(SELECT 1 FROM public.referral_codes WHERE code = upper(trim(p_code)));
$function$;

CREATE OR REPLACE FUNCTION public.claim_discovery_selection(p_device_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.ussd_package_discoveries%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.ussd_package_discoveries
  WHERE session_state = 'selected'
    AND device_id = p_device_id
    AND selected_order_id IS NOT NULL
    AND selected_index IS NOT NULL
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.ussd_package_discoveries
  SET session_state = 'delivering', session_device_id = p_device_id
  WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'label', v_row.selected_label,
    'index', v_row.selected_index,
    'order_id', v_row.selected_order_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_next_bulk_sms(p_device_id text, p_sim_slot integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.bulk_sms_queue%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.android_devices d
    WHERE d.device_id = p_device_id AND d.archived_at IS NULL
      AND (
        (COALESCE(p_sim_slot, 1) = 1 AND COALESCE(d.sim1_enabled, true) = true)
        OR (p_sim_slot = 2 AND COALESCE(d.sim2_enabled, true) = true)
      )
  ) THEN RETURN NULL; END IF;

  SELECT * INTO v_row FROM public.bulk_sms_queue
  WHERE status = 'pending' AND device_id = p_device_id
    AND (p_sim_slot IS NULL OR sim_slot = p_sim_slot)
  ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.bulk_sms_queue SET status = 'processing' WHERE id = v_row.id;
  RETURN to_jsonb(v_row);
END; $function$;

CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id text, p_providers text[] DEFAULT '{}'::text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  delivery_row public.delivery_queue%ROWTYPE;
  v_allowed text[];
  v_slot integer;
  result JSON;
BEGIN
  UPDATE public.delivery_queue
  SET status = 'pending', android_device_id = NULL
  WHERE status = 'processing'
    AND last_attempt_at < now() - interval '2 minutes';

  IF EXISTS (
    SELECT 1 FROM public.delivery_queue
    WHERE android_device_id = p_device_id AND status = 'processing'
  ) THEN RETURN NULL; END IF;

  WITH sims AS (
    SELECT d.device_id, 1 AS slot,
           lower(NULLIF(COALESCE(d.sim1_provider, d.provider_name), '')) AS provider,
           COALESCE(d.sim1_priority, 1) AS priority,
           COALESCE(d.sim1_enabled, true) AS enabled,
           d.last_ping_at
    FROM public.android_devices d
    WHERE d.archived_at IS NULL
    UNION ALL
    SELECT d.device_id, 2,
           lower(NULLIF(d.sim2_provider, '')),
           COALESCE(d.sim2_priority, 1),
           COALESCE(d.sim2_enabled, true),
           d.last_ping_at
    FROM public.android_devices d
    WHERE d.archived_at IS NULL
  ),
  active AS (
    SELECT s.* FROM sims s
    WHERE s.enabled = true
      AND s.provider IS NOT NULL
      AND (
        s.device_id = p_device_id
        OR (s.last_ping_at IS NOT NULL AND s.last_ping_at > now() - interval '3 minutes')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.delivery_queue q
        WHERE q.status = 'processing'
          AND q.android_device_id = s.device_id
          AND COALESCE(q.sim_slot, 1) = s.slot
      )
  ),
  best AS (
    SELECT provider, min(priority) AS p FROM active GROUP BY provider
  )
  SELECT ARRAY(
    SELECT DISTINCT a.provider
    FROM active a
    JOIN best b ON b.provider = a.provider AND b.p = a.priority
    WHERE a.device_id = p_device_id
  ) INTO v_allowed;

  IF v_allowed IS NULL OR array_length(v_allowed, 1) IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO delivery_row
  FROM public.delivery_queue
  WHERE status = 'pending'
    AND (android_device_id IS NULL OR android_device_id = p_device_id)
    AND lower(provider_name) = ANY(v_allowed)
    AND (array_length(p_providers, 1) IS NULL OR lower(provider_name) = ANY(p_providers))
    AND (scheduled_at IS NULL OR scheduled_at <= now())
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT slot INTO v_slot FROM (
    SELECT 1 AS slot,
           lower(NULLIF(COALESCE(d.sim1_provider, d.provider_name), '')) AS provider,
           COALESCE(d.sim1_priority, 1) AS priority,
           COALESCE(d.sim1_enabled, true) AS enabled
    FROM public.android_devices d
    WHERE d.device_id = p_device_id AND d.archived_at IS NULL
    UNION ALL
    SELECT 2,
           lower(NULLIF(d.sim2_provider, '')),
           COALESCE(d.sim2_priority, 1),
           COALESCE(d.sim2_enabled, true)
    FROM public.android_devices d
    WHERE d.device_id = p_device_id AND d.archived_at IS NULL
  ) s
  WHERE s.enabled = true
    AND s.provider = lower(delivery_row.provider_name)
    AND NOT EXISTS (
      SELECT 1 FROM public.delivery_queue q
      WHERE q.status = 'processing'
        AND q.android_device_id = p_device_id
        AND COALESCE(q.sim_slot, 1) = s.slot
    )
  ORDER BY s.priority ASC, s.slot ASC
  LIMIT 1;

  IF v_slot IS NULL THEN RETURN NULL; END IF;

  UPDATE public.delivery_queue
  SET status = 'processing',
      android_device_id = p_device_id,
      sim_slot = v_slot,
      last_attempt_at = now(),
      attempts = COALESCE(attempts, 0) + 1
  WHERE id = delivery_row.id;

  SELECT row_to_json(d) INTO result
  FROM (SELECT dq.* FROM public.delivery_queue dq WHERE dq.id = delivery_row.id) d;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_next_discovery(p_device_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.ussd_package_discoveries%ROWTYPE;
  v_root_name text;
  v_providers text[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT lower(p) FROM (
      SELECT unnest(ARRAY[
        CASE WHEN COALESCE(d.sim1_enabled, true) THEN COALESCE(d.sim1_provider, d.provider_name) END,
        CASE WHEN COALESCE(d.sim2_enabled, true) THEN d.sim2_provider END
      ]) AS p
      FROM public.android_devices d
      WHERE d.device_id = p_device_id AND d.archived_at IS NULL
    ) t WHERE p IS NOT NULL AND p <> ''
  ) INTO v_providers;

  IF v_providers IS NULL OR array_length(v_providers, 1) IS NULL THEN RETURN NULL; END IF;

  UPDATE public.ussd_package_discoveries
  SET status = 'pending', device_id = NULL
  WHERE status = 'processing' AND claimed_at < now() - interval '2 minutes';

  UPDATE public.ussd_package_discoveries
  SET status = 'failed', error = 'timeout', completed_at = now()
  WHERE status = 'processing'
    AND claimed_at IS NOT NULL
    AND claimed_at < now() - interval '90 seconds';

  UPDATE public.ussd_package_discoveries
  SET status = 'failed', error = 'no_device_available', completed_at = now()
  WHERE status = 'pending' AND queued_at < now() - interval '5 minutes';

  SELECT dsc.* INTO v_row
  FROM public.ussd_package_discoveries dsc
  JOIN public.data_packages_config pkg ON pkg.id = dsc.root_package_id
  JOIN public.providers_config prov ON prov.id = pkg.provider_id
  WHERE dsc.status = 'pending'
    AND dsc.queued_at >= now() - interval '5 minutes'
    AND lower(prov.provider_name) = ANY (v_providers)
  ORDER BY dsc.queued_at ASC
  LIMIT 1
  FOR UPDATE OF dsc SKIP LOCKED;

  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.ussd_package_discoveries
  SET status = 'processing', device_id = p_device_id, claimed_at = now()
  WHERE id = v_row.id;

  SELECT package_name INTO v_root_name
  FROM public.data_packages_config WHERE id = v_row.root_package_id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'phone_number', v_row.phone_number,
    'menu1_label', COALESCE(v_root_name, ''),
    'ussd_code', '*212*' || v_row.phone_number || '#'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_discovery(p_id uuid, p_raw_menu text, p_items jsonb DEFAULT '[]'::jsonb, p_error text DEFAULT NULL::text, p_hold boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.ussd_package_discoveries
  SET raw_menu = p_raw_menu,
      items = COALESCE(p_items, '[]'::jsonb),
      error = p_error,
      status = CASE WHEN p_error IS NULL THEN 'done' ELSE 'failed' END,
      completed_at = now(),
      expires_at = CASE WHEN p_error IS NULL THEN now() + interval '30 minutes' ELSE NULL END,
      session_state = CASE WHEN p_error IS NULL AND p_hold THEN 'open' ELSE 'closed' END,
      session_expires_at = CASE WHEN p_error IS NULL AND p_hold THEN now() + interval '8 minutes' ELSE NULL END
  WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_discovery_selection(p_id uuid, p_success boolean, p_response text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_row public.ussd_package_discoveries%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.ussd_package_discoveries WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false); END IF;

  UPDATE public.ussd_package_discoveries
  SET session_state = CASE WHEN p_success THEN 'consumed' ELSE 'lost' END,
      session_expires_at = NULL
  WHERE id = p_id;

  IF v_row.selected_order_id IS NOT NULL THEN
    IF p_success THEN
      UPDATE public.orders
      SET status = 'completed',
          delivery_status = 'delivered',
          delivered_at = now(),
          delivery_notes = COALESCE(p_response, delivery_notes),
          updated_at = now()
      WHERE id = v_row.selected_order_id;
    ELSE
      PERFORM public.discovery_delivery_fallback(p_id);
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.discovery_delivery_fallback(p_discovery_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.ussd_package_discoveries%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_root record;
  v_phone text;
  v_code text;
BEGIN
  SELECT * INTO v_row FROM public.ussd_package_discoveries WHERE id = p_discovery_id;
  IF NOT FOUND OR v_row.selected_order_id IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.delivery_queue q WHERE q.order_id = v_row.selected_order_id) THEN RETURN; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_row.selected_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT p.package_name, pr.provider_name INTO v_root
  FROM public.data_packages_config p
  LEFT JOIN public.providers_config pr ON pr.id = p.provider_id
  WHERE p.id = v_row.root_package_id;

  v_phone := v_row.phone_number;
  v_code := '*212*' || v_phone || '#|'
            || replace(COALESCE(v_root.package_name, 'Data'), ',', ' ') || ','
            || replace(COALESCE(v_row.selected_label, ''), ',', ' ');

  INSERT INTO public.delivery_queue
    (order_id, provider_name, receiver_phone, ussd_code, status, attempts, discovery_menu_label)
  VALUES
    (v_order.id, lower(COALESCE(v_root.provider_name, 'hormuud')), v_order.receiver_phone, v_code, 'pending', 0, v_row.selected_label);
END;
$function$;

CREATE OR REPLACE FUNCTION public.discovery_has_waiting_request()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.ussd_package_discoveries
    WHERE status = 'pending'
      AND created_at >= now() - interval '90 seconds'
  )
$function$;

CREATE OR REPLACE FUNCTION public.discovery_session_lost(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_state text;
BEGIN
  SELECT session_state INTO v_state
  FROM public.ussd_package_discoveries WHERE id = p_id;

  IF v_state IN ('selected', 'delivering') THEN
    RETURN jsonb_build_object('success', true, 'skipped', true);
  END IF;

  UPDATE public.ussd_package_discoveries
  SET session_state = 'lost', session_expires_at = NULL
  WHERE id = p_id;
  PERFORM public.discovery_delivery_fallback(p_id);
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_bulk_sms_counter(p_campaign_id uuid, p_field text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_queue_id uuid;
  v_total int;
  v_sent int;
  v_failed int;
  v_new_status text;
BEGIN
  IF p_field NOT IN ('sent_count','failed_count') THEN RETURN; END IF;
  v_new_status := CASE WHEN p_field = 'sent_count' THEN 'sent' ELSE 'failed' END;

  UPDATE public.bulk_sms_queue
  SET status = v_new_status, sent_at = now()
  WHERE id = (
    SELECT id FROM public.bulk_sms_queue
    WHERE campaign_id = p_campaign_id AND status = 'pending'
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id INTO v_queue_id;

  IF v_queue_id IS NULL THEN RETURN; END IF;

  IF p_field = 'sent_count' THEN
    UPDATE public.bulk_sms_campaigns SET sent_count = sent_count + 1 WHERE id = p_campaign_id;
  ELSE
    UPDATE public.bulk_sms_campaigns SET failed_count = failed_count + 1 WHERE id = p_campaign_id;
  END IF;

  SELECT total_recipients, sent_count, failed_count
  INTO v_total, v_sent, v_failed
  FROM public.bulk_sms_campaigns WHERE id = p_campaign_id;

  IF v_sent + v_failed >= v_total THEN
    UPDATE public.bulk_sms_campaigns SET status = 'completed'
    WHERE id = p_campaign_id AND status <> 'completed';
  END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.normalize_provider_text(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT trim(regexp_replace(lower(coalesce(t,'')), '[^a-z]+', ' ', 'g'))
$function$;

CREATE OR REPLACE FUNCTION public.renew_delivery_lease(p_queue_id uuid, p_device_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_updated integer;
BEGIN
  UPDATE public.delivery_queue
  SET lease_expires_at = now() + interval '5 minutes',
      lease_renewed_at = now()
  WHERE id = p_queue_id
    AND status = 'processing'
    AND android_device_id = p_device_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.riyokaab_effective_order_cost(p_order_cost numeric, p_package_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN COALESCE(p_order_cost, 0) > 0 THEN p_order_cost
    WHEN p_package_id IS NOT NULL THEN COALESCE((
      SELECT dp.cost_price FROM public.data_packages_config dp WHERE dp.id = p_package_id
    ), 0)
    ELSE 0
  END;
$function$;

CREATE OR REPLACE FUNCTION public.riyokaab_effective_order_cost_v2(p_order_cost numeric, p_package_id uuid, p_discovery_root_id uuid, p_discovery_menu_label text, p_selling_price numeric)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN COALESCE(p_order_cost, 0) > 0 THEN p_order_cost
    WHEN p_discovery_root_id IS NOT NULL THEN COALESCE((
      SELECT c.cost_price
      FROM public.ussd_price_catalog c
      WHERE c.root_package_id = p_discovery_root_id
        AND c.is_active = true
        AND (
          (
            NULLIF(trim(COALESCE(p_discovery_menu_label, '')), '') IS NOT NULL
            AND c.normalized_label = lower(
              trim(regexp_replace(regexp_replace(COALESCE(p_discovery_menu_label, ''), '[^[:alnum:]]+', ' ', 'g'), '\s+', ' ', 'g'))
            )
          )
          OR abs(COALESCE(c.selling_price, 0) - COALESCE(p_selling_price, 0)) < 0.000001
        )
      ORDER BY
        CASE
          WHEN c.normalized_label = lower(
            trim(regexp_replace(regexp_replace(COALESCE(p_discovery_menu_label, ''), '[^[:alnum:]]+', ' ', 'g'), '\s+', ' ', 'g'))
          ) THEN 0
          ELSE 1
        END,
        c.updated_at DESC
      LIMIT 1
    ), (
      SELECT dp.cost_price FROM public.data_packages_config dp WHERE dp.id = p_package_id
    ), 0)
    WHEN p_package_id IS NOT NULL THEN COALESCE((
      SELECT dp.cost_price FROM public.data_packages_config dp WHERE dp.id = p_package_id
    ), 0)
    ELSE 0
  END;
$function$;

CREATE OR REPLACE FUNCTION public.riyokaab_is_financial_order(p_status text, p_delivery_status text, p_payment_source text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT (
    (
      lower(COALESCE(p_status, '')) IN ('completed','paid','payment_confirmed','delivered')
      OR lower(COALESCE(p_delivery_status, '')) = 'delivered'
    )
    AND lower(COALESCE(p_status, '')) NOT IN ('cancelled','canceled')
    AND lower(COALESCE(p_payment_source, '')) <> 'offline_unmatched_approved'
  );
$function$;

CREATE OR REPLACE FUNCTION public.riyokaab_is_flow_order(p_order_id uuid, p_package_id uuid, p_discovery_root_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.riyokaab_profit_amount(p_selling numeric, p_cost numeric, p_rate numeric, p_is_flow boolean)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN COALESCE(p_is_flow, false)
      THEN COALESCE(p_selling, 0) - COALESCE(p_cost, 0)
    ELSE
      (COALESCE(p_selling, 0) * (1 + COALESCE(p_rate, 0))) - COALESCE(p_cost, 0)
  END;
$function$;

CREATE OR REPLACE FUNCTION public.save_offline_registration(p_sender text, p_receiver text, p_provider_id text, p_provider_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_sender IS NULL OR p_receiver IS NULL OR length(p_sender) < 6 OR length(p_receiver) < 6 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid phones');
  END IF;
  INSERT INTO public.offline_registrations(sender_phone, receiver_phone, provider_id, provider_name, is_active)
  VALUES (p_sender, p_receiver, p_provider_id, p_provider_name, true)
  ON CONFLICT (sender_phone) DO UPDATE
    SET receiver_phone = EXCLUDED.receiver_phone,
        provider_id = EXCLUDED.provider_id,
        provider_name = EXCLUDED.provider_name,
        is_active = true,
        updated_at = now();
  RETURN jsonb_build_object('success', true);
END; $function$;

CREATE OR REPLACE FUNCTION public.ussd_duration_key(p_label text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN m IS NULL THEN NULL ELSE m[1] || ' ' || m[2] END
  FROM (
    SELECT regexp_match(
      public.ussd_normalize_label(public.ussd_strip_price_prefix(p_label)),
      '([0-9]+) (saac|maalin)'
    ) AS m
  ) s
$function$;

CREATE OR REPLACE FUNCTION public.ussd_strip_price_prefix(p_label text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT btrim(regexp_replace(coalesce(p_label,''), '^\s*[^=]{0,20}=\s*', ''))
$function$;

-- Explicit execution grants matching runtime usage.
REVOKE ALL ON FUNCTION public.save_offline_registration(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_offline_registration(text,text,text,text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.check_referral_code_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_referral_code_exists(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_next_bulk_sms(text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_bulk_sms(text,integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.increment_bulk_sms_counter(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_bulk_sms_counter(uuid,text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_next_discovery(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_discovery(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.discovery_has_waiting_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discovery_has_waiting_request() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_discovery_selection(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_discovery_selection(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.discovery_delivery_fallback(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discovery_delivery_fallback(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.complete_discovery_selection(uuid,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_discovery_selection(uuid,boolean,text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.discovery_session_lost(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discovery_session_lost(uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_discovery(uuid,text,jsonb,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_discovery(uuid,text,jsonb,text,boolean) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.renew_delivery_lease(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renew_delivery_lease(uuid,text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_next_delivery(text,text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_delivery(text,text[]) TO anon, authenticated, service_role;

-- Security hardening: pin search_path for immutable helpers.
ALTER FUNCTION public.normalize_provider_text(text) SET search_path TO public;
ALTER FUNCTION public.riyokaab_profit_amount(numeric,numeric,numeric,boolean) SET search_path TO public;
ALTER FUNCTION public.riyokaab_is_financial_order(text,text,text) SET search_path TO public;
