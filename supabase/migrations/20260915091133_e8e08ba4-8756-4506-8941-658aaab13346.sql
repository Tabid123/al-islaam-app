-- 1) Exact provider failure messages
INSERT INTO public.provider_response_messages (provider_name, message_so, message_en, is_active, display_order)
VALUES
  ('Hormuud', 'Qalad baa dhacay, fadlan isku day mar kale', 'An error occurred, please try again later', true, 1),
  ('Somnet', 'Qalad baa dhacay, fadlan isku day mar kale', 'error occurred, please try again later', true, 2),
  ('Somtel', 'lambarkani ma shaqaynayo, fadlan iska hubi', 'this number is not working, please check it', true, 3),
  ('Amtel', 'Jawaabtu waqti ayeey qaadday ama waa fashilantay', 'The third-party response times out, or fails, or return an error message', true, 4)
ON CONFLICT (provider_name) DO UPDATE
SET message_so = EXCLUDED.message_so,
    message_en = EXCLUDED.message_en,
    is_active = true;

-- 2) Normalizer + auto-fail trigger
CREATE OR REPLACE FUNCTION public.normalize_provider_text(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(regexp_replace(lower(coalesce(t,'')), '[^a-z]+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.auto_fail_on_provider_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  resp text;
  nresp text;
  hit boolean;
BEGIN
  -- Only consider rows that are not already finished successfully
  IF NEW.status IN ('completed', 'delivered', 'cancelled') THEN
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
          delivery_notes = nullif(trim(coalesce(NEW.provider_response, NEW.error_message, '')), '')
      WHERE id = NEW.order_id
        AND coalesce(delivery_status, '') NOT IN ('delivered', 'cancelled');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_fail_provider_message ON public.delivery_queue;
CREATE TRIGGER trg_auto_fail_provider_message
BEFORE INSERT OR UPDATE OF provider_response, error_message, status ON public.delivery_queue
FOR EACH ROW EXECUTE FUNCTION public.auto_fail_on_provider_message();