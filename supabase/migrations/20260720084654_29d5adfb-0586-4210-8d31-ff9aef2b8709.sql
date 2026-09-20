
-- Fix bulk SMS counter looping: mark queue row as sent/failed atomically so re-polls become no-ops
CREATE OR REPLACE FUNCTION public.increment_bulk_sms_counter(p_campaign_id uuid, p_field text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_queue_id uuid;
  v_total int;
  v_sent int;
  v_failed int;
  v_new_status text;
BEGIN
  IF p_field NOT IN ('sent_count','failed_count') THEN
    RETURN;
  END IF;

  v_new_status := CASE WHEN p_field = 'sent_count' THEN 'sent' ELSE 'failed' END;

  -- Atomically claim one pending row for this campaign
  UPDATE public.bulk_sms_queue
  SET status = v_new_status,
      sent_at = now()
  WHERE id = (
    SELECT id FROM public.bulk_sms_queue
    WHERE campaign_id = p_campaign_id AND status = 'pending'
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING id INTO v_queue_id;

  -- If nothing pending, do nothing (prevents runaway counter)
  IF v_queue_id IS NULL THEN
    RETURN;
  END IF;

  IF p_field = 'sent_count' THEN
    UPDATE public.bulk_sms_campaigns
    SET sent_count = sent_count + 1
    WHERE id = p_campaign_id;
  ELSE
    UPDATE public.bulk_sms_campaigns
    SET failed_count = failed_count + 1
    WHERE id = p_campaign_id;
  END IF;

  -- Mark campaign completed when done
  SELECT total_recipients, sent_count, failed_count
    INTO v_total, v_sent, v_failed
  FROM public.bulk_sms_campaigns WHERE id = p_campaign_id;

  IF v_sent + v_failed >= v_total THEN
    UPDATE public.bulk_sms_campaigns
    SET status = 'completed'
    WHERE id = p_campaign_id AND status <> 'completed';
  END IF;
END; $function$;

-- Repair the runaway campaign
UPDATE public.bulk_sms_campaigns
SET sent_count = 0, failed_count = 0
WHERE id = '25f44254-9c4d-4b99-93f5-b0fa1e641387';
