-- Restore the storefront contract documented in Riyokaab_App's USSD-212 guide.
-- Keep existing catalog prices, device claiming and payment/delivery routing.
CREATE OR REPLACE FUNCTION public.ussd_discovery_label_key(p_label text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(lower(public.ussd_strip_price_prefix(p_label)), '([0-9])([a-z])', '\1 \2', 'g'),
            '[^a-z0-9]+', ' ', 'g'),
          '\m(xadidneyn|xadidnaan|xaddidnayn|xadidneen|xadidnayn)\M', 'xadidnayn', 'g'),
        '\m(ku hadal|kuhadall|kuhadal|kuhdal)\M', 'kuhadal', 'g'),
      '\m(saacadood|saacado|saacad|saacc|saac|hours|hour|hrs|hr)\M', 'saac', 'g'),
    '\m(maalmood|maalmo|maalin|days|day)\M', 'maalin', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.ussd_discovery_duration_key(p_label text)
RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT CASE WHEN m IS NULL THEN NULL ELSE m[1] || ' ' || m[2] END
  FROM (SELECT regexp_match(public.ussd_discovery_label_key(p_label), '([0-9]+) (saac|maalin)') AS m) s;
$$;

CREATE OR REPLACE FUNCTION public.request_package_discovery(p_root_package_id uuid, p_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_phone text; v_id uuid; v_status text;
BEGIN
  v_phone := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  IF left(v_phone,3) = '252' THEN v_phone := substring(v_phone FROM 4); END IF;
  IF left(v_phone,1) = '0' THEN v_phone := substring(v_phone FROM 2); END IF;
  IF v_phone !~ '^[0-9]{9}$' THEN
    RETURN jsonb_build_object('success',false,'message','Lambar sax ah geli');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.data_packages_config p JOIN public.providers_config pr ON pr.id=p.provider_id
    WHERE p.id=p_root_package_id AND p.is_discovery_root=true AND p.is_active=true AND pr.is_active=true
  ) THEN RETURN jsonb_build_object('success',false,'message','Xulasho lama helin'); END IF;

  -- Concurrent taps reuse only unfinished work. Completed carrier menus are always re-scanned.
  PERFORM pg_advisory_xact_lock(hashtext('discovery:' || p_root_package_id::text || ':' || v_phone));
  SELECT d.id,d.status INTO v_id,v_status FROM public.ussd_package_discoveries d
  WHERE d.root_package_id=p_root_package_id AND d.phone_number=v_phone
    AND d.status IN ('pending','processing') AND d.queued_at > now()-interval '5 minutes'
  ORDER BY d.queued_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('success',true,'id',v_id,'status',v_status); END IF;
  INSERT INTO public.ussd_package_discoveries(root_package_id,phone_number,status,expires_at)
  VALUES(p_root_package_id,v_phone,'pending',now()+interval '5 minutes') RETURNING id INTO v_id;
  RETURN jsonb_build_object('success',true,'id',v_id,'status','pending');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_discovery_queue_status(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.ussd_package_discoveries%ROWTYPE; v_ahead integer := 0;
BEGIN
  SELECT * INTO v_row FROM public.ussd_package_discoveries WHERE id=p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('found',false); END IF;
  IF v_row.status='pending' THEN
    SELECT count(*) INTO v_ahead FROM public.ussd_package_discoveries q
    JOIN public.data_packages_config p ON p.id=q.root_package_id
    WHERE q.status='pending' AND q.queued_at < v_row.queued_at AND q.queued_at >= now()-interval '5 minutes'
      AND p.provider_id=(SELECT provider_id FROM public.data_packages_config WHERE id=v_row.root_package_id);
  END IF;
  RETURN jsonb_build_object('found',true,'id',v_row.id,'status',v_row.status,'error',v_row.error,
    'ahead',v_ahead,'position',v_ahead+1,'queued_at',v_row.queued_at,'claimed_at',v_row.claimed_at,
    'session_state',v_row.session_state);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_package_discovery(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.ussd_package_discoveries%ROWTYPE; v_packages jsonb;
BEGIN
  SELECT * INTO v_row FROM public.ussd_package_discoveries WHERE id=p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'message','Codsi lama helin'); END IF;
  IF v_row.status <> 'done' THEN
    RETURN jsonb_build_object('success',true,'status',v_row.status,'error',v_row.error,'packages','[]'::jsonb);
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'index',item->>'index','label',coalesce(c.label,public.ussd_strip_price_prefix(item->>'label')),
    'carrier_label',public.ussd_strip_price_prefix(item->>'label'),'selling_price',c.selling_price,
    'info_line1',c.info_line1,'info_line2',c.info_line2,'price_missing',c.selling_price IS NULL
  ) ORDER BY ordinal),'[]'::jsonb) INTO v_packages
  FROM jsonb_array_elements(coalesce(v_row.items,'[]'::jsonb)) WITH ORDINALITY AS rows(item,ordinal)
  LEFT JOIN LATERAL (
    SELECT catalog.label,catalog.selling_price,catalog.info_line1,catalog.info_line2
    FROM public.ussd_price_catalog catalog
    WHERE catalog.root_package_id=v_row.root_package_id AND catalog.is_active=true AND catalog.selling_price > 0
      AND (public.ussd_discovery_label_key(catalog.label)=public.ussd_discovery_label_key(item->>'label')
        OR (public.ussd_discovery_duration_key(catalog.label) IS NOT NULL
          AND public.ussd_discovery_duration_key(catalog.label)=public.ussd_discovery_duration_key(item->>'label')))
    ORDER BY (public.ussd_discovery_label_key(catalog.label)=public.ussd_discovery_label_key(item->>'label')) DESC,
      catalog.updated_at DESC,catalog.id
    LIMIT 1
  ) c ON true;
  RETURN jsonb_build_object('success',true,'status','done','packages',v_packages,
    'session_state',v_row.session_state,
    'session_seconds_left',CASE WHEN v_row.session_state='open'
      THEN greatest(0,floor(extract(epoch FROM (coalesce(v_row.session_expires_at,now())-now())))::integer) ELSE 0 END);
END;
$$;

-- Keep the existing boolean signature; never close an already purchased selection.
CREATE OR REPLACE FUNCTION public.release_discovery_session(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.ussd_package_discoveries
  SET status=CASE WHEN status IN ('pending','processing') THEN 'failed' ELSE status END,
    error=CASE WHEN status IN ('pending','processing') THEN 'cancelled_by_user' ELSE error END,
    completed_at=CASE WHEN status IN ('pending','processing') THEN now() ELSE completed_at END,
    session_state='closed',session_device_id=NULL,session_expires_at=NULL,
    session_note='released_by_user',updated_at=now()
  WHERE id=p_id AND selected_order_id IS NULL AND session_state NOT IN ('selected','delivering','consumed');
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_discovery(p_id uuid,p_raw_menu text,p_items jsonb DEFAULT '[]'::jsonb,p_error text DEFAULT NULL::text,p_hold boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.ussd_package_discoveries SET raw_menu=p_raw_menu,items=coalesce(p_items,'[]'::jsonb),error=p_error,
    status=CASE WHEN p_error IS NULL THEN 'done' ELSE 'failed' END,completed_at=now(),
    expires_at=CASE WHEN p_error IS NULL THEN now()+interval '30 minutes' ELSE NULL END,
    session_state=CASE WHEN p_error IS NULL AND p_hold THEN 'open' ELSE 'closed' END,
    session_expires_at=CASE WHEN p_error IS NULL AND p_hold THEN now()+interval '8 minutes' ELSE NULL END
  WHERE id=p_id AND session_note IS DISTINCT FROM 'released_by_user';
  RETURN jsonb_build_object('success',FOUND);
END;
$$;
