-- Backfill missing provider links on offline registrations
UPDATE public.offline_registrations r
SET provider_id = pc.id,
    provider_name = pc.provider_name,
    updated_at = now()
FROM public.providers_config pc
WHERE r.provider_id IS NULL
  AND r.provider_name IS NOT NULL
  AND lower(split_part(pc.provider_name, ' ', 1)) = lower(split_part(r.provider_name, ' ', 1));

-- Keep provider link canonical for every future registration
CREATE OR REPLACE FUNCTION public.normalize_offline_registration_provider()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text;
BEGIN
  IF NEW.provider_id IS NOT NULL THEN
    SELECT id, provider_name INTO v_id, v_name
    FROM public.providers_config WHERE id = NEW.provider_id;
  END IF;

  IF v_id IS NULL AND NEW.provider_name IS NOT NULL THEN
    SELECT id, provider_name INTO v_id, v_name
    FROM public.providers_config
    WHERE lower(split_part(provider_name, ' ', 1)) = lower(split_part(NEW.provider_name, ' ', 1))
    ORDER BY is_active DESC
    LIMIT 1;
  END IF;

  IF v_id IS NOT NULL THEN
    NEW.provider_id := v_id;
    NEW.provider_name := v_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_offline_registration_provider ON public.offline_registrations;
CREATE TRIGGER trg_normalize_offline_registration_provider
BEFORE INSERT OR UPDATE ON public.offline_registrations
FOR EACH ROW EXECUTE FUNCTION public.normalize_offline_registration_provider();