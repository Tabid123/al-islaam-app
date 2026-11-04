-- Atomically enqueue manual unmatched USSD orders, including multi-step bundles.
-- The order row lock serializes concurrent admin resend attempts.
CREATE OR REPLACE FUNCTION public.enqueue_manual_unmatched_ussd(
  p_order_id uuid,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_order public.orders%ROWTYPE;
  v_existing record;
  v_first uuid;
  v_count int;
  v_provider text;
  v_receiver text;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.payment_source IS DISTINCT FROM 'offline_unmatched_retry'
    OR v_order.delivery_status NOT IN ('pending', 'processing')
    OR v_order.status NOT IN ('paid', 'completed', 'payment_confirmed') THEN
    RAISE EXCEPTION 'Order not eligible for manual unmatched activation';
  END IF;

  SELECT lower(btrim(p.provider_name)) INTO v_provider
  FROM public.providers_config p
  WHERE p.id = v_order.provider_id AND p.is_active = true;
  v_receiver := right(regexp_replace(coalesce(v_order.receiver_phone,''), '[^0-9]', '', 'g'), 9);
  IF v_provider IS NULL OR v_provider IN ('amtel','somlink') OR length(v_receiver) <> 9 THEN
    RAISE EXCEPTION 'Invalid USSD provider or recipient';
  END IF;

  SELECT id, status, ussd_code INTO v_existing
  FROM public.delivery_queue
  WHERE order_id = p_order_id ORDER BY created_at LIMIT 1;
  IF FOUND THEN
    IF v_existing.status NOT IN ('pending','scheduled','processing','completed')
       OR nullif(btrim(v_existing.ussd_code),'') IS NULL THEN
      RAISE EXCEPTION 'Existing delivery requires manual verification';
    END IF;
    RETURN jsonb_build_object('success',true,'queueId',v_existing.id,'alreadyQueued',true);
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 24 THEN
    RAISE EXCEPTION 'Invalid manual delivery queue items';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM jsonb_to_recordset(p_items) AS r(
    provider_name text, receiver_phone text, ussd_code text,
    package_code text, pin_code text, status text, scheduled_at timestamptz
  )
  WHERE lower(btrim(coalesce(r.provider_name,''))) <> v_provider
     OR right(regexp_replace(coalesce(r.receiver_phone,''),'[^0-9]','','g'),9) <> v_receiver
     OR r.status NOT IN ('pending','scheduled')
     OR nullif(btrim(r.ussd_code),'') IS NULL
     OR r.ussd_code !~ '^\*[0-9]'
     OR r.ussd_code !~ '#'
     OR r.ussd_code ~ '[{}()]'
     OR r.provider_name IS NULL
     OR r.receiver_phone IS NULL
     OR r.status IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Invalid provider, recipient, status or USSD code in prepared queue';
  END IF;

  WITH inserted AS (
    INSERT INTO public.delivery_queue
      (order_id,provider_name,receiver_phone,ussd_code,package_code,pin_code,status,scheduled_at)
    SELECT p_order_id, r.provider_name, r.receiver_phone, r.ussd_code,
      r.package_code, r.pin_code, r.status, r.scheduled_at
    FROM jsonb_to_recordset(p_items) AS r(
      provider_name text, receiver_phone text, ussd_code text,
      package_code text, pin_code text, status text, scheduled_at timestamptz
    )
    RETURNING id
  ) SELECT id INTO v_first FROM inserted LIMIT 1;

  IF v_first IS NULL THEN RAISE EXCEPTION 'No delivery queued'; END IF;
  RETURN jsonb_build_object('success', true, 'queueId', v_first, 'alreadyQueued', false);
END;
$fn$;

REVOKE ALL ON FUNCTION public.enqueue_manual_unmatched_ussd(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_manual_unmatched_ussd(uuid,jsonb) TO service_role;