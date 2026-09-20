CREATE OR REPLACE FUNCTION public.claim_next_discovery(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ussd_package_discoveries%ROWTYPE;
  v_root_name text;
BEGIN
  UPDATE public.ussd_package_discoveries
  SET status = 'pending', device_id = NULL
  WHERE status = 'processing'
    AND claimed_at < now() - interval '2 minutes';

  UPDATE public.ussd_package_discoveries
  SET status = 'failed', error = 'timeout', completed_at = now()
  WHERE status = 'pending'
    AND created_at < now() - interval '60 seconds';

  SELECT * INTO v_row
  FROM public.ussd_package_discoveries
  WHERE status = 'pending'
    AND created_at >= now() - interval '60 seconds'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.ussd_package_discoveries
  SET status = 'processing', device_id = p_device_id, claimed_at = now()
  WHERE id = v_row.id;

  SELECT package_name INTO v_root_name
  FROM public.data_packages_config
  WHERE id = v_row.root_package_id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'phone_number', v_row.phone_number,
    'menu1_label', COALESCE(v_root_name, ''),
    'ussd_code', '*212*' || v_row.phone_number || '#'
  );
END;
$$;