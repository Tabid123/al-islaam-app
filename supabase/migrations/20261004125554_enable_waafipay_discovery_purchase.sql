-- Backend-only operations. Public clients submit an opaque scan ID and menu index;
-- the Edge Function obtains the payable price and cost snapshot from this resolver.
CREATE OR REPLACE FUNCTION public.waafipay_resolve_discovery_offer(
  p_discovery_id uuid,p_root_package_id uuid,p_phone text,p_index text,p_expected_price numeric
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE d public.ussd_package_discoveries%ROWTYPE; item jsonb; c record; root record;
BEGIN
  SELECT * INTO d FROM public.ussd_package_discoveries WHERE id=p_discovery_id;
  IF NOT FOUND OR d.root_package_id<>p_root_package_id OR d.phone_number<>p_phone THEN
    RETURN jsonb_build_object('success',false,'error','discovery_offer_unavailable','message','Xirmadan lambarkaaga looma xaqiijin. Dib u baar Maamuus.');
  END IF;
  IF d.status<>'done' OR d.session_state<>'open' OR d.session_expires_at IS NULL
    OR d.session_expires_at<=now() OR d.selected_order_id IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'error','discovery_expired','message','Waqtigii xirmooyinka wuu dhammaaday. Dib u baar Maamuus ka hor lacag-bixinta.');
  END IF;
  SELECT p.id,p.provider_id,p.package_name INTO root FROM public.data_packages_config p
  JOIN public.providers_config pr ON pr.id=p.provider_id
  WHERE p.id=p_root_package_id AND p.is_discovery_root=true AND p.is_active=true AND pr.is_active=true;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','package_not_available'); END IF;
  SELECT value INTO item FROM jsonb_array_elements(d.items) WHERE value->>'index'=p_index LIMIT 1;
  IF item IS NULL THEN RETURN jsonb_build_object('success',false,'error','discovery_offer_unavailable'); END IF;
  -- Same match and tie-breaking as get_package_discovery: never trust a client price or label.
  SELECT catalog.* INTO c FROM public.ussd_price_catalog catalog
  WHERE catalog.root_package_id=p_root_package_id AND catalog.is_active=true AND catalog.selling_price>0
    AND (public.ussd_discovery_label_key(catalog.label)=public.ussd_discovery_label_key(item->>'label')
      OR (public.ussd_discovery_duration_key(catalog.label) IS NOT NULL
        AND public.ussd_discovery_duration_key(catalog.label)=public.ussd_discovery_duration_key(item->>'label')))
  ORDER BY (public.ussd_discovery_label_key(catalog.label)=public.ussd_discovery_label_key(item->>'label')) DESC,
    catalog.updated_at DESC,catalog.id LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','discovery_offer_unavailable','message','Xirmadan qiimaheeda lama helin. Dib u baar Maamuus.'); END IF;
  IF p_expected_price IS NULL OR p_expected_price<=0 OR abs(round(c.selling_price,2)-p_expected_price)>0.005 THEN
    RETURN jsonb_build_object('success',false,'error','discovery_price_changed','message','Qiimaha xirmada ayaa isbeddelay. Dib u baar oo xaqiiji qiimaha cusub.');
  END IF;
  RETURN jsonb_build_object('success',true,'offer',jsonb_build_object(
    'discovery_id',d.id,'root_package_id',root.id,'provider_id',root.provider_id,'root_name',root.package_name,
    'index',p_index,'label',c.label,'carrier_label',item->>'label','catalog_id',c.id,
    'selling_price',round(c.selling_price,2),'cost_price',c.cost_price,'data_amount',coalesce(c.info_line1,c.label)
  ));
END;
$$;

-- Atomic fulfillment: an approved reference creates its order and claims the live
-- session (or queues the exact carrier offer) in the same transaction. A retry never debits.
CREATE OR REPLACE FUNCTION public.waafipay_finalize_discovery_purchase(p_transaction_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE t public.waafipay_transactions%ROWTYPE; offer jsonb; context jsonb;
  v_order_id uuid; delivery_state text; queued boolean; selected_count integer; code text;
BEGIN
  SELECT * INTO t FROM public.waafipay_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF NOT FOUND OR t.status<>'approved' OR t.waafi_transaction_id IS NULL THEN
    RAISE EXCEPTION 'An approved WaafiPay transaction is required';
  END IF;
  context:=t.raw_response->'request_context'; offer:=context->'discovery';
  IF offer IS NULL OR (offer->>'root_package_id')::uuid<>t.package_id
    OR (offer->>'selling_price')::numeric<>t.amount OR t.amount<=0 THEN
    RAISE EXCEPTION 'Verified discovery snapshot missing or mismatched';
  END IF;
  v_order_id:=t.order_id;
  IF v_order_id IS NULL THEN
    INSERT INTO public.orders(customer_phone,sender_phone,receiver_phone,provider_id,package_id,package_name,
      data_amount,selling_price,cost_price,payment_provider_id,payment_source,status,delivery_status,tx_id,
      discovery_root_id,discovery_menu_label)
    VALUES(coalesce(context->>'customer_phone',t.payer_phone),t.payer_phone,t.receiver_phone,
      (offer->>'provider_id')::uuid,t.package_id,offer->>'label',offer->>'data_amount',t.amount,
      (offer->>'cost_price')::numeric,t.payment_provider_id,'waafipay','completed','pending',
      'waafipay:'||t.waafi_transaction_id,t.package_id,offer->>'carrier_label')
    RETURNING id INTO v_order_id;

    UPDATE public.ussd_package_discoveries SET session_state='selected',selected_order_id=v_order_id,
      selected_label=offer->>'carrier_label',selected_index=offer->>'index',session_expires_at=now()+interval '5 minutes'
    WHERE id=(offer->>'discovery_id')::uuid AND root_package_id=t.package_id AND phone_number=t.receiver_phone
      AND status='done' AND session_state='open' AND session_expires_at>now() AND selected_order_id IS NULL;
    GET DIAGNOSTICS selected_count=ROW_COUNT;
    IF selected_count=0 THEN
      -- The carrier may close its session while the payer enters the wallet PIN.
      -- Re-dial using the verified carrier label including its original price.
      code:='*212*'||t.receiver_phone||'#|'
        ||regexp_replace(offer->>'root_name','[,|#\r\n]',' ','g')||','
        ||regexp_replace(offer->>'carrier_label','[,|#\r\n]',' ','g');
      INSERT INTO public.delivery_queue(order_id,provider_name,receiver_phone,ussd_code,status,attempts,discovery_menu_label,scheduled_at)
      VALUES(v_order_id,offer->>'provider_slug',t.receiver_phone,code,'pending',0,offer->>'carrier_label',now());
    END IF;
    UPDATE public.waafipay_transactions SET order_id=v_order_id,updated_at=now() WHERE id=t.id;
  END IF;
  SELECT o.delivery_status INTO delivery_state FROM public.orders o WHERE o.id=v_order_id;
  SELECT delivery_state='delivered' OR EXISTS(
    SELECT 1 FROM public.delivery_queue q WHERE q.order_id=v_order_id
      AND q.status IN ('pending','processing','completed','scheduled')) OR EXISTS(
    SELECT 1 FROM public.ussd_package_discoveries d WHERE d.selected_order_id=v_order_id
      AND d.session_state IN ('selected','delivering','consumed')) INTO queued;
  RETURN jsonb_build_object('order_id',v_order_id,'delivery_queued',coalesce(queued,false),'delivery_status',delivery_state);
END;
$$;

REVOKE ALL ON FUNCTION public.waafipay_resolve_discovery_offer(uuid,uuid,text,text,numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.waafipay_finalize_discovery_purchase(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.waafipay_resolve_discovery_offer(uuid,uuid,text,text,numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.waafipay_finalize_discovery_purchase(uuid) TO service_role;
