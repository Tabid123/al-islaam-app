ALTER TABLE public.ussd_package_discoveries
  ADD COLUMN IF NOT EXISTS session_state text NOT NULL DEFAULT 'closed',
  ADD COLUMN IF NOT EXISTS session_device_id text,
  ADD COLUMN IF NOT EXISTS session_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS selected_label text,
  ADD COLUMN IF NOT EXISTS selected_index text,
  ADD COLUMN IF NOT EXISTS selected_order_id uuid;

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
      session_expires_at = CASE WHEN p_error IS NULL AND p_hold THEN now() + interval '3 minutes' ELSE NULL END
  WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_package_discovery(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.ussd_package_discoveries%ROWTYPE;
  v_packages jsonb;
BEGIN
  SELECT * INTO v_row FROM public.ussd_package_discoveries WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Codsi lama helin');
  END IF;

  IF v_row.status <> 'done' THEN
    RETURN jsonb_build_object('success', true, 'status', v_row.status, 'error', v_row.error, 'packages', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
           'index', item->>'index',
           'label', c.label,
           'selling_price', c.selling_price,
           'info_line1', c.info_line1,
           'info_line2', c.info_line2
         )), '[]'::jsonb)
  INTO v_packages
  FROM jsonb_array_elements(v_row.items) AS item
  JOIN public.ussd_price_catalog c
    ON c.root_package_id = v_row.root_package_id
   AND c.is_active = true
   AND c.normalized_label = public.ussd_normalize_label(
         public.ussd_strip_price_prefix(item->>'label'));

  RETURN jsonb_build_object(
    'success', true,
    'status', 'done',
    'packages', v_packages,
    'session_state', v_row.session_state,
    'session_seconds_left', GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(v_row.session_expires_at, now()) - now()))::int)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_discovery_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_root record;
  v_provider text;
  v_label text;
  v_menu1 text;
  v_code text;
  v_phone text;
  v_disc public.ussd_package_discoveries%ROWTYPE;
  v_index text;
BEGIN
  IF NEW.package_id IS NULL THEN RETURN NEW; END IF;

  SELECT p.id, p.package_name, p.is_discovery_root, pr.provider_name
    INTO v_root
  FROM public.data_packages_config p
  LEFT JOIN public.providers_config pr ON pr.id = p.provider_id
  WHERE p.id = NEW.package_id;

  IF NOT FOUND OR COALESCE(v_root.is_discovery_root, false) = false THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.delivery_queue q WHERE q.order_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_label := NULLIF(btrim(COALESCE(NEW.discovery_menu_label, '')), '');

  IF v_label IS NULL THEN
    SELECT pop.discovery_menu_label INTO v_label
    FROM public.pending_online_payments pop
    WHERE pop.package_id = NEW.package_id
      AND pop.receiver_phone = NEW.receiver_phone
      AND pop.discovery_menu_label IS NOT NULL
      AND pop.created_at > now() - interval '3 hours'
    ORDER BY abs(pop.expected_amount - NEW.selling_price), pop.created_at DESC
    LIMIT 1;
  END IF;

  IF v_label IS NULL THEN RETURN NEW; END IF;

  UPDATE public.orders
     SET discovery_menu_label = v_label,
         discovery_root_id = NEW.package_id
   WHERE id = NEW.id;

  v_phone := regexp_replace(NEW.receiver_phone, '[^0-9]', '', 'g');
  IF length(v_phone) = 12 AND left(v_phone,3) = '252' THEN v_phone := substring(v_phone from 4); END IF;
  IF length(v_phone) = 10 AND left(v_phone,1) = '0'  THEN v_phone := substring(v_phone from 2); END IF;

  -- 1) Session furan oo taleefanku hayo: isla session-kaas ayaa xirmada laga dooranayaa.
  SELECT * INTO v_disc
  FROM public.ussd_package_discoveries d
  WHERE d.root_package_id = NEW.package_id
    AND d.phone_number = v_phone
    AND d.session_state = 'open'
    AND d.session_expires_at > now()
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    SELECT item->>'index' INTO v_index
    FROM jsonb_array_elements(v_disc.items) AS item
    WHERE public.ussd_normalize_label(public.ussd_strip_price_prefix(item->>'label'))
        = public.ussd_normalize_label(public.ussd_strip_price_prefix(v_label))
    LIMIT 1;

    IF v_index IS NOT NULL THEN
      UPDATE public.ussd_package_discoveries
         SET session_state = 'selected',
             selected_label = v_label,
             selected_index = v_index,
             selected_order_id = NEW.id
       WHERE id = v_disc.id;
      RETURN NEW;
    END IF;
  END IF;

  -- 2) Session ma furna: dib-u-garaacis caadi ah (label + qiimo ayaa la match-garaynayaa taleefanka).
  v_menu1 := replace(COALESCE(v_root.package_name, 'Data'), ',', ' ');
  v_code := '*212*' || v_phone || '#|'
            || v_menu1 || ',' || replace(v_label, ',', ' ');
  v_provider := lower(COALESCE(v_root.provider_name, 'hormuud'));

  INSERT INTO public.delivery_queue (order_id, provider_name, receiver_phone, ussd_code, status, attempts, discovery_menu_label)
  VALUES (NEW.id, v_provider, NEW.receiver_phone, v_code, 'pending', 0, v_label);

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_discovery_selection(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.ussd_package_discoveries%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.ussd_package_discoveries
  WHERE session_state = 'selected'
    AND (session_device_id IS NULL OR session_device_id = p_device_id OR device_id = p_device_id)
  ORDER BY created_at ASC
  LIMIT 1 FOR UPDATE SKIP LOCKED;

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

  INSERT INTO public.delivery_queue (order_id, provider_name, receiver_phone, ussd_code, status, attempts, discovery_menu_label)
  VALUES (v_order.id, lower(COALESCE(v_root.provider_name, 'hormuud')), v_order.receiver_phone, v_code, 'pending', 0, v_row.selected_label);
END;
$function$;

CREATE OR REPLACE FUNCTION public.discovery_session_lost(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.ussd_package_discoveries
     SET session_state = 'lost', session_expires_at = NULL
   WHERE id = p_id;
  PERFORM public.discovery_delivery_fallback(p_id);
  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_discovery_selection(p_id uuid, p_success boolean, p_response text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.ussd_package_discoveries%ROWTYPE;
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
      -- Session ka dhacay / fashil: dib-u-garaacis ayaa la isku dayayaa
      PERFORM public.discovery_delivery_fallback(p_id);
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_discovery_selection(text) FROM public;
REVOKE ALL ON FUNCTION public.complete_discovery_selection(uuid, boolean, text) FROM public;
REVOKE ALL ON FUNCTION public.discovery_session_lost(uuid) FROM public;
REVOKE ALL ON FUNCTION public.discovery_delivery_fallback(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_discovery_selection(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_discovery_selection(uuid, boolean, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.discovery_session_lost(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.discovery_delivery_fallback(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_discovery(uuid, text, jsonb, text, boolean) TO anon, authenticated, service_role;