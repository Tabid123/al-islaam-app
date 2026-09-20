CREATE OR REPLACE FUNCTION public.broadcast_discovery_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'id', NEW.id,
    'status', NEW.status,
    'session_state', NEW.session_state,
    'device_id', NEW.device_id,
    'claimed_at', NEW.claimed_at,
    'completed_at', NEW.completed_at,
    'error', NEW.error
  );

  PERFORM realtime.send(payload, 'discovery_update', 'discovery:' || NEW.id::text, false);
  PERFORM realtime.send(payload, 'discovery_update', 'discovery_queue', false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_broadcast_discovery_change ON public.ussd_package_discoveries;

CREATE TRIGGER trg_broadcast_discovery_change
AFTER INSERT OR UPDATE ON public.ussd_package_discoveries
FOR EACH ROW EXECUTE FUNCTION public.broadcast_discovery_change();