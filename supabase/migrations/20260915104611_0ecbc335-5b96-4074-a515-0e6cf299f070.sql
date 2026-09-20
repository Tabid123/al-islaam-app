CREATE OR REPLACE FUNCTION public.retry_failed_order(p_order_id uuid, p_new_receiver_phone text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_provider_name text;
  v_ussd_code text;
  v_package_code text;
  v_sim_password text;
  v_clean_phone text;
BEGIN
  v_clean_phone := regexp_replace(COALESCE(p_new_receiver_phone,''), '\D', '', 'g');
  IF length(v_clean_phone) < 9 THEN
    RETURN json_build_object('success', false, 'message', 'Lambar sax ah geli');
  END IF;
  IF length(v_clean_phone) = 10 AND left(v_clean_phone,1) = '0' THEN
    v_clean_phone := substring(v_clean_phone from 2);
  END IF;
  IF length(v_clean_phone) = 12 AND left(v_clean_phone,3) = '252' THEN
    v_clean_phone := substring(v_clean_phone from 4);
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Dalab lama helin');
  END IF;

  IF COALESCE(v_order.delivery_status,'') NOT IN ('failed','cancelled') THEN
    RETURN json_build_object('success', false, 'message', 'Dalabkani lama xalin karo');
  END IF;

  SELECT provider_name INTO v_provider_name
  FROM public.providers_config WHERE id = v_order.provider_id;

  SELECT ussd_code, sim_password INTO v_ussd_code, v_sim_password
  FROM public.data_packages_config WHERE id = v_order.package_id;

  v_package_code := v_ussd_code;

  IF v_ussd_code IS NOT NULL THEN
    v_ussd_code := replace(v_ussd_code, '{receiver_phone}', v_clean_phone);
    v_ussd_code := replace(v_ussd_code, '{cost_price}', COALESCE(v_order.cost_price::text, ''));
    v_ussd_code := replace(v_ussd_code, '{sim_password}', COALESCE(v_sim_password, ''));
    v_ussd_code := replace(v_ussd_code, '{package_code}', COALESCE(v_package_code, ''));
  END IF;

  UPDATE public.orders
  SET receiver_phone  = v_clean_phone,
      delivery_status = 'pending',
      status          = CASE WHEN status = 'cancelled' THEN 'payment_confirmed' ELSE status END,
      delivered_at    = NULL,
      delivery_notes  = COALESCE(delivery_notes,'') || E'\n[Customer retry ' || to_char(now(),'YYYY-MM-DD HH24:MI') || ']',
      updated_at      = now()
  WHERE id = p_order_id;

  INSERT INTO public.delivery_queue (
    order_id, provider_name, receiver_phone, ussd_code, package_code,
    status, attempts, created_at
  ) VALUES (
    p_order_id, COALESCE(v_provider_name,''), v_clean_phone, v_ussd_code, v_package_code,
    'pending', 0, now()
  );

  RETURN json_build_object('success', true, 'message', 'Dalabkaaga waa la diray');
END;
$function$;