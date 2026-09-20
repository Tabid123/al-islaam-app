ALTER TABLE public.ussd_package_discoveries
  ADD COLUMN IF NOT EXISTS queued_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.claim_next_discovery(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ussd_package_discoveries%ROWTYPE;
  v_root_name text;
  v_providers text[];
BEGIN
  -- Shirkadaha device-kani taageero
  SELECT ARRAY(
    SELECT DISTINCT lower(p) FROM (
      SELECT unnest(ARRAY[d.primary_for_provider, d.sim1_provider, d.sim2_provider, d.provider_name]) AS p
      FROM public.android_devices d
      WHERE d.device_id = p_device_id AND d.archived_at IS NULL
    ) t WHERE p IS NOT NULL AND p <> ''
  ) INTO v_providers;

  -- Shaqo ku dhegtay device kale (>2 daqiiqo) dib u safee
  UPDATE public.ussd_package_discoveries
  SET status = 'pending', device_id = NULL
  WHERE status = 'processing'
    AND claimed_at < now() - interval '2 minutes';

  -- Baaris dhab ahaan bilaabatay oo aan dhammaan gudaha 90s
  UPDATE public.ussd_package_discoveries
  SET status = 'failed', error = 'timeout', completed_at = now()
  WHERE status = 'processing'
    AND claimed_at IS NOT NULL
    AND claimed_at < now() - interval '90 seconds';

  -- Saf dheeraaday: device ma banaana
  UPDATE public.ussd_package_discoveries
  SET status = 'failed', error = 'no_device_available', completed_at = now()
  WHERE status = 'pending'
    AND queued_at < now() - interval '5 minutes';

  SELECT dsc.* INTO v_row
  FROM public.ussd_package_discoveries dsc
  JOIN public.data_packages_config pkg ON pkg.id = dsc.root_package_id
  JOIN public.providers_config prov ON prov.id = pkg.provider_id
  WHERE dsc.status = 'pending'
    AND dsc.queued_at >= now() - interval '5 minutes'
    AND (
      v_providers IS NULL
      OR array_length(v_providers, 1) IS NULL
      OR lower(prov.provider_name) = ANY (v_providers)
    )
  ORDER BY dsc.queued_at ASC
  LIMIT 1
  FOR UPDATE OF dsc SKIP LOCKED;

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

CREATE OR REPLACE FUNCTION public.get_discovery_queue_status(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ussd_package_discoveries%ROWTYPE;
  v_ahead int := 0;
BEGIN
  SELECT * INTO v_row FROM public.ussd_package_discoveries WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF v_row.status = 'pending' THEN
    SELECT count(*) INTO v_ahead
    FROM public.ussd_package_discoveries
    WHERE status = 'pending'
      AND queued_at < v_row.queued_at
      AND queued_at >= now() - interval '5 minutes';
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'status', v_row.status,
    'error', v_row.error,
    'ahead', v_ahead,
    'position', v_ahead + 1,
    'active_sessions', (SELECT count(*) FROM public.ussd_package_discoveries WHERE status = 'processing'),
    'queued_at', v_row.queued_at,
    'claimed_at', v_row.claimed_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_discovery_queue_status(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_discovery(text) TO anon, authenticated, service_role;