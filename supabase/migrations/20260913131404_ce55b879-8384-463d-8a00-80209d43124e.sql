
ALTER TABLE public.android_devices
  ADD COLUMN IF NOT EXISTS sim1_priority integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sim2_priority integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sim1_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sim2_enabled boolean NOT NULL DEFAULT true;

-- Backfill from legacy flags
UPDATE public.android_devices
SET sim1_enabled = false, sim2_enabled = false
WHERE COALESCE(send_enabled, true) = false;

UPDATE public.android_devices
SET sim1_priority = CASE WHEN primary_for_provider IS NOT NULL
       AND lower(primary_for_provider) = lower(COALESCE(sim1_provider, provider_name, '')) THEN 1 ELSE 2 END,
    sim2_priority = CASE WHEN primary_for_provider IS NOT NULL
       AND lower(primary_for_provider) = lower(COALESCE(sim2_provider, '')) THEN 1 ELSE 2 END
WHERE primary_for_provider IS NOT NULL;

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
  -- Auto-reset stale processing items (stuck > 2 minutes)
  UPDATE public.delivery_queue
  SET status = 'pending', android_device_id = NULL
  WHERE status = 'processing'
    AND last_attempt_at < now() - interval '2 minutes';

  -- Single-flight guard per device
  IF EXISTS (
    SELECT 1 FROM public.delivery_queue
    WHERE android_device_id = p_device_id AND status = 'processing'
  ) THEN
    RETURN NULL;
  END IF;

  -- Providers this device may claim right now (waiter model)
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
      AND (s.device_id = p_device_id
           OR (s.last_ping_at IS NOT NULL AND s.last_ping_at > now() - interval '3 minutes'))
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

  IF v_allowed IS NULL OR array_length(v_allowed, 1) IS NULL THEN
    RETURN NULL;
  END IF;

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

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Pick the best free slot on this device for that provider
  SELECT slot INTO v_slot FROM (
    SELECT 1 AS slot, lower(NULLIF(COALESCE(d.sim1_provider, d.provider_name), '')) AS provider,
           COALESCE(d.sim1_priority, 1) AS priority, COALESCE(d.sim1_enabled, true) AS enabled
    FROM public.android_devices d WHERE d.device_id = p_device_id AND d.archived_at IS NULL
    UNION ALL
    SELECT 2, lower(NULLIF(d.sim2_provider, '')), COALESCE(d.sim2_priority, 1), COALESCE(d.sim2_enabled, true)
    FROM public.android_devices d WHERE d.device_id = p_device_id AND d.archived_at IS NULL
  ) s
  WHERE s.enabled = true
    AND s.provider = lower(delivery_row.provider_name)
    AND NOT EXISTS (
      SELECT 1 FROM public.delivery_queue q
      WHERE q.status = 'processing' AND q.android_device_id = p_device_id
        AND COALESCE(q.sim_slot, 1) = s.slot
    )
  ORDER BY s.priority ASC, s.slot ASC
  LIMIT 1;

  IF v_slot IS NULL THEN
    RETURN NULL;
  END IF;

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
  ) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row FROM public.bulk_sms_queue
  WHERE status = 'pending' AND device_id = p_device_id
    AND (p_sim_slot IS NULL OR sim_slot = p_sim_slot)
  ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.bulk_sms_queue SET status = 'processing' WHERE id = v_row.id;
  RETURN to_jsonb(v_row);
END; $function$;

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

  IF v_providers IS NULL OR array_length(v_providers, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.ussd_package_discoveries
  SET status = 'pending', device_id = NULL
  WHERE status = 'processing'
    AND claimed_at < now() - interval '2 minutes';

  UPDATE public.ussd_package_discoveries
  SET status = 'failed', error = 'timeout', completed_at = now()
  WHERE status = 'processing'
    AND claimed_at IS NOT NULL
    AND claimed_at < now() - interval '90 seconds';

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
    AND lower(prov.provider_name) = ANY (v_providers)
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
$function$;
