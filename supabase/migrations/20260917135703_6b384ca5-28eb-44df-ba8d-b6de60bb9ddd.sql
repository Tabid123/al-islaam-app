ALTER TABLE public.delivery_queue
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_device_id text,
  ADD COLUMN IF NOT EXISTS lease_renewed_at timestamptz;

-- One active queue row per order (manual resend allowed once the previous row is finished)
DELETE FROM public.delivery_queue a
USING public.delivery_queue b
WHERE a.order_id = b.order_id
  AND a.status IN ('pending','queued','processing')
  AND b.status IN ('pending','queued','processing')
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS delivery_queue_one_active_per_order
  ON public.delivery_queue (order_id)
  WHERE status IN ('pending','queued','processing');

CREATE OR REPLACE FUNCTION public.renew_delivery_lease(p_queue_id uuid, p_device_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.delivery_queue
  SET lease_expires_at = now() + interval '5 minutes',
      lease_renewed_at = now()
  WHERE id = p_queue_id
    AND status = 'processing'
    AND android_device_id = p_device_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.renew_delivery_lease(uuid, text) TO anon, authenticated, service_role;

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
  -- Lease expiry recovery. A row whose owner died is only re-queued when USSD was
  -- never dispatched; a dispatched row goes to verification_required so we never
  -- dial the same order twice.
  UPDATE public.delivery_queue
  SET status = 'pending',
      android_device_id = NULL,
      lease_expires_at = NULL,
      lease_device_id = NULL
  WHERE status = 'processing'
    AND dispatched_at IS NULL
    AND COALESCE(lease_expires_at, last_attempt_at + interval '2 minutes') < now();

  UPDATE public.delivery_queue
  SET status = 'verification_required',
      error_message = COALESCE(error_message, 'Device lease expired after dispatch. Manual verification required.')
  WHERE status = 'processing'
    AND dispatched_at IS NOT NULL
    AND COALESCE(lease_expires_at, dispatched_at + interval '5 minutes') < now();

  -- One USSD per device at a time
  IF EXISTS (
    SELECT 1 FROM public.delivery_queue
    WHERE android_device_id = p_device_id AND status = 'processing'
  ) THEN
    RETURN NULL;
  END IF;

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
    AND NULLIF(btrim(ussd_code), '') IS NOT NULL
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
      lease_device_id = p_device_id,
      lease_expires_at = now() + interval '5 minutes',
      lease_renewed_at = now(),
      attempts = COALESCE(attempts, 0) + 1
  WHERE id = delivery_row.id;

  SELECT row_to_json(d) INTO result
  FROM (SELECT dq.* FROM public.delivery_queue dq WHERE dq.id = delivery_row.id) d;

  RETURN result;
END;
$function$;