CREATE OR REPLACE FUNCTION public.request_package_discovery(p_root_package_id uuid, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_phone text;
  v_row public.ussd_package_discoveries%ROWTYPE;
  v_id uuid;
BEGIN
  v_phone := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  IF length(v_phone) = 12 AND left(v_phone,3) = '252' THEN v_phone := substring(v_phone from 4); END IF;
  IF length(v_phone) = 10 AND left(v_phone,1) = '0'  THEN v_phone := substring(v_phone from 2); END IF;
  IF length(v_phone) < 9 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lambar sax ah geli');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.data_packages_config
                 WHERE id = p_root_package_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Xulasho lama helin');
  END IF;

  -- CACHE LA JOOJIYAY: Hormuud xirmooyinku daqiiqad kastaa way is-bedelaan,
  -- sidaa darteed mar walba baaris cusub (dialog garaac) ayaa la sameynayaa.

  -- Codsi hadda socda oo aad u cusub ayaa keliya dib loo isticmaalayaa.
  SELECT * INTO v_row FROM public.ussd_package_discoveries
  WHERE root_package_id = p_root_package_id
    AND phone_number = v_phone
    AND status IN ('pending','processing')
    AND created_at > now() - interval '30 seconds'
  ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'id', v_row.id, 'status', v_row.status, 'cached', false);
  END IF;

  INSERT INTO public.ussd_package_discoveries(root_package_id, phone_number)
  VALUES (p_root_package_id, v_phone)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'status', 'pending', 'cached', false);
END;
$function$;