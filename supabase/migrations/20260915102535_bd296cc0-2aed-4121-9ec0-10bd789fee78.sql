CREATE OR REPLACE FUNCTION public.auto_fail_on_provider_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resp text;
  nresp text;
  hit boolean;
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  resp := coalesce(NEW.provider_response, '') || ' ' || coalesce(NEW.error_message, '');
  nresp := public.normalize_provider_text(resp);
  IF length(nresp) < 6 THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.provider_response_messages m
    WHERE m.is_active
      AND (
        (length(public.normalize_provider_text(m.message_so)) >= 6
         AND position(public.normalize_provider_text(m.message_so) IN nresp) > 0)
        OR
        (length(public.normalize_provider_text(m.message_en)) >= 6
         AND position(public.normalize_provider_text(m.message_en) IN nresp) > 0)
        OR
        (length(nresp) >= 8 AND length(public.normalize_provider_text(m.message_so)) >= 8
         AND position(nresp IN public.normalize_provider_text(m.message_so)) > 0)
        OR
        (length(nresp) >= 8 AND length(public.normalize_provider_text(m.message_en)) >= 8
         AND position(nresp IN public.normalize_provider_text(m.message_en)) > 0)
      )
  ) INTO hit;

  IF hit THEN
    NEW.status := 'failed';
    UPDATE public.orders
      SET delivery_status = 'failed',
          status = CASE WHEN status = 'completed' THEN 'failed' ELSE status END,
          delivery_notes = nullif(trim(coalesce(NEW.provider_response, NEW.error_message, '')), '')
      WHERE id = NEW.order_id
        AND coalesce(delivery_status, '') <> 'cancelled';
  END IF;
  RETURN NEW;
END;
$$;

-- Saxid dalabyihii hore (24 saac) ee jawaab qalad ah leh laakiin completed ah
WITH bad AS (
  SELECT dq.id, dq.order_id, dq.provider_response
  FROM public.delivery_queue dq
  WHERE dq.status = 'completed'
    AND dq.created_at > now() - interval '24 hours'
    AND EXISTS (
      SELECT 1 FROM public.provider_response_messages m
      WHERE m.is_active
        AND (
          (length(public.normalize_provider_text(m.message_so)) >= 6
           AND position(public.normalize_provider_text(m.message_so) IN public.normalize_provider_text(coalesce(dq.provider_response,'') || ' ' || coalesce(dq.error_message,''))) > 0)
          OR
          (length(public.normalize_provider_text(m.message_en)) >= 6
           AND position(public.normalize_provider_text(m.message_en) IN public.normalize_provider_text(coalesce(dq.provider_response,'') || ' ' || coalesce(dq.error_message,''))) > 0)
        )
    )
), upd_q AS (
  UPDATE public.delivery_queue q SET status = 'failed'
  FROM bad WHERE q.id = bad.id
  RETURNING q.order_id
)
UPDATE public.orders o
SET delivery_status = 'failed',
    status = CASE WHEN o.status = 'completed' THEN 'failed' ELSE o.status END,
    delivery_notes = coalesce(bad.provider_response, o.delivery_notes)
FROM bad
WHERE o.id = bad.order_id
  AND coalesce(o.delivery_status,'') <> 'cancelled';