ALTER TABLE public.android_devices ADD COLUMN IF NOT EXISTS primary_for_provider text;

UPDATE public.android_devices SET primary_for_provider = 'Hormuud' WHERE is_primary_hormuud_sim = true AND primary_for_provider IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS android_devices_primary_for_provider_uidx
  ON public.android_devices (lower(primary_for_provider))
  WHERE primary_for_provider IS NOT NULL AND archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.sync_primary_hormuud_flag()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.is_primary_hormuud_sim := (NEW.primary_for_provider IS NOT NULL AND lower(NEW.primary_for_provider) = 'hormuud');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_primary_hormuud_flag ON public.android_devices;
CREATE TRIGGER trg_sync_primary_hormuud_flag
BEFORE INSERT OR UPDATE OF primary_for_provider ON public.android_devices
FOR EACH ROW EXECUTE FUNCTION public.sync_primary_hormuud_flag();