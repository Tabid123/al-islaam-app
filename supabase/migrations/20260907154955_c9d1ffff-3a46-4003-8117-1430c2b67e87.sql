ALTER TABLE public.android_devices
  ADD COLUMN IF NOT EXISTS send_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.claim_next_delivery(p_device_id text, p_providers text[] DEFAULT '{}'::text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  delivery_row public.delivery_queue%ROWTYPE;
  result JSON;
  processing_count INTEGER;
  is_primary_hormuud BOOLEAN;
  v_has_enabled BOOLEAN;
  v_enabled text[];
  v_blocked text[];
BEGIN
  -- Auto-reset stale processing items (stuck > 2 minutes)
  UPDATE public.delivery_queue
  SET status = 'pending', android_device_id = NULL
  WHERE status = 'processing'
    AND last_attempt_at < now() - interval '2 minutes';

  -- SIM-yada dirista loo ogol yahay / loo diiday
  SELECT ARRAY(
    SELECT DISTINCT lower(p) FROM (
      SELECT unnest(ARRAY[d.primary_for_provider, d.sim1_provider, d.sim2_provider, d.provider_name]) AS p
      FROM public.android_devices d
      WHERE d.device_id = p_device_id AND d.archived_at IS NULL AND COALESCE(d.send_enabled, true) = true
    ) t WHERE p IS NOT NULL AND p <> ''
  ) INTO v_enabled;

  SELECT ARRAY(
    SELECT DISTINCT lower(p) FROM (
      SELECT unnest(ARRAY[d.primary_for_provider, d.sim1_provider, d.sim2_provider, d.provider_name]) AS p
      FROM public.android_devices d
      WHERE d.device_id = p_device_id AND d.archived_at IS NULL AND COALESCE(d.send_enabled, true) = false
    ) t WHERE p IS NOT NULL AND p <> ''
  ) INTO v_blocked;

  SELECT EXISTS (
    SELECT 1 FROM public.android_devices d
    WHERE d.device_id = p_device_id AND d.archived_at IS NULL AND COALESCE(d.send_enabled, true) = true
  ) INTO v_has_enabled;

  IF NOT v_has_enabled THEN
    RETURN NULL;
  END IF;

  -- shirkadaha kaliya SIM damsan leh
  v_blocked := ARRAY(SELECT b FROM unnest(v_blocked) b WHERE b <> ALL(COALESCE(v_enabled, '{}'::text[])));

  -- Single-flight guard
  SELECT COUNT(*) INTO processing_count
  FROM public.delivery_queue
  WHERE android_device_id = p_device_id
    AND status = 'processing';

  IF processing_count > 0 THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(is_primary_hormuud_sim, false) INTO is_primary_hormuud
  FROM public.android_devices
  WHERE device_id = p_device_id
  LIMIT 1;
  is_primary_hormuud := COALESCE(is_primary_hormuud, false);

  SELECT * INTO delivery_row
  FROM public.delivery_queue
  WHERE status = 'pending'
    AND (android_device_id IS NULL OR android_device_id = p_device_id)
    AND (array_length(p_providers, 1) IS NULL OR lower(provider_name) = ANY(p_providers))
    AND (array_length(v_blocked, 1) IS NULL OR lower(provider_name) <> ALL(v_blocked))
    AND (scheduled_at IS NULL OR scheduled_at <= now())
    AND (
      lower(provider_name) <> 'hormuud'
      OR is_primary_hormuud = true
    )
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.delivery_queue
  SET status = 'processing',
      android_device_id = p_device_id,
      last_attempt_at = now(),
      attempts = COALESCE(attempts, 0) + 1
  WHERE id = delivery_row.id;

  SELECT row_to_json(d) INTO result
  FROM (
    SELECT dq.*
    FROM public.delivery_queue dq
    WHERE dq.id = delivery_row.id
  ) d;

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
    WHERE d.device_id = p_device_id AND d.archived_at IS NULL AND COALESCE(d.send_enabled, true) = true
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