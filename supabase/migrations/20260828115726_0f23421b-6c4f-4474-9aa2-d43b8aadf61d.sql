ALTER TABLE public.ussd_package_discoveries ADD COLUMN IF NOT EXISTS session_note text;

-- 1) Hold-ka session-ka: 8 daqiiqo (taleefanku wuu ilaalinayaa dialog-ga)
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

-- 2) Session-ka horeba loo doortay/la dirayo HA loo sheegin inuu lumay
CREATE OR REPLACE FUNCTION public.discovery_session_lost(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_state text;
BEGIN
  SELECT session_state INTO v_state FROM public.ussd_package_discoveries WHERE id = p_id;
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

-- 3) Fallback-ka dib-u-garaacista: qiimaha shirkadda ku dar label-ka si price-match u suurtogasho
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
  v_label_priced text;
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
             selected_order_id = NEW.id,
             session_expires_at = now() + interval '5 minutes'
       WHERE id = v_disc.id;
      RETURN NEW;
    END IF;
  END IF;

  -- 2) Session ma furna: dib-u-garaacis. Qiimaha shirkadda label-ka ku dar (haddii la helo)
  --    si taleefanku uu price-tier match u sameyn karo marka menu-gu is-beddelo.
  SELECT item->>'label' INTO v_label_priced
  FROM public.ussd_package_discoveries d
  CROSS JOIN LATERAL jsonb_array_elements(d.items) AS item
  WHERE d.root_package_id = NEW.package_id
    AND d.phone_number = v_phone
    AND jsonb_array_length(COALESCE(d.items, '[]'::jsonb)) > 0
    AND public.ussd_normalize_label(public.ussd_strip_price_prefix(item->>'label'))
      = public.ussd_normalize_label(public.ussd_strip_price_prefix(v_label))
  ORDER BY d.created_at DESC
  LIMIT 1;

  v_menu1 := replace(COALESCE(v_root.package_name, 'Data'), ',', ' ');
  v_code := '*212*' || v_phone || '#|'
            || v_menu1 || ',' || replace(COALESCE(NULLIF(btrim(v_label_priced), ''), v_label), ',', ' ');
  v_provider := lower(COALESCE(v_root.provider_name, 'hormuud'));

  INSERT INTO public.delivery_queue (order_id, provider_name, receiver_phone, ussd_code, status, attempts, discovery_menu_label)
  VALUES (NEW.id, v_provider, NEW.receiver_phone, v_code, 'pending', 0, v_label);

  RETURN NEW;
END;
$function$;