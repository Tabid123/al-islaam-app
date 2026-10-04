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
  UPDATE public.delivery_queue
  SET status = 'pending', android_device_id = NULL
  WHERE status = 'processing'
    AND last_attempt_at < now() - interval '2 minutes';

  IF EXISTS (
    SELECT 1 FROM public.delivery_queue
    WHERE android_device_id = p_device_id AND status = 'processing'
  ) THEN RETURN NULL; END IF;

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
      AND (
        s.device_id = p_device_id
        OR (s.last_ping_at IS NOT NULL AND s.last_ping_at > now() - interval '3 minutes')
      )
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

  IF v_allowed IS NULL OR array_length(v_allowed, 1) IS NULL THEN RETURN NULL; END IF;

  -- Scheduled rows become eligible when their due time arrives. A scheduled
  -- row left behind after a completed delivery must never resend that order.
  SELECT dq.* INTO delivery_row
  FROM public.delivery_queue dq
  WHERE dq.status IN ('pending', 'scheduled')
    AND (dq.android_device_id IS NULL OR dq.android_device_id = p_device_id)
    AND lower(dq.provider_name) = ANY(v_allowed)
    AND (array_length(p_providers, 1) IS NULL OR lower(dq.provider_name) = ANY(p_providers))
    AND (dq.scheduled_at IS NULL OR dq.scheduled_at <= now())
    AND (dq.status <> 'scheduled' OR NOT EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = dq.order_id AND o.delivery_status = 'delivered'
    ))
  ORDER BY dq.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT slot INTO v_slot FROM (
    SELECT 1 AS slot,
           lower(NULLIF(COALESCE(d.sim1_provider, d.provider_name), '')) AS provider,
           COALESCE(d.sim1_priority, 1) AS priority,
           COALESCE(d.sim1_enabled, true) AS enabled
    FROM public.android_devices d
    WHERE d.device_id = p_device_id AND d.archived_at IS NULL
    UNION ALL
    SELECT 2,
           lower(NULLIF(d.sim2_provider, '')),
           COALESCE(d.sim2_priority, 1),
           COALESCE(d.sim2_enabled, true)
    FROM public.android_devices d
    WHERE d.device_id = p_device_id AND d.archived_at IS NULL
  ) s
  WHERE s.enabled = true
    AND s.provider = lower(delivery_row.provider_name)
    AND NOT EXISTS (
      SELECT 1 FROM public.delivery_queue q
      WHERE q.status = 'processing'
        AND q.android_device_id = p_device_id
        AND COALESCE(q.sim_slot, 1) = s.slot
    )
  ORDER BY s.priority ASC, s.slot ASC
  LIMIT 1;

  IF v_slot IS NULL THEN RETURN NULL; END IF;

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
$function$
