CREATE OR REPLACE FUNCTION public.normalize_offline_registration_provider()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_name text;
BEGIN
  IF NEW.provider_id IS NOT NULL AND NEW.provider_id ~ '^[0-9a-fA-F-]{36}$' THEN
    SELECT id, provider_name INTO v_id, v_name
    FROM public.providers_config WHERE id = NEW.provider_id::uuid;
  END IF;

  IF v_id IS NULL AND NEW.provider_name IS NOT NULL THEN
    SELECT id, provider_name INTO v_id, v_name
    FROM public.providers_config
    WHERE lower(split_part(provider_name, ' ', 1)) = lower(split_part(NEW.provider_name, ' ', 1))
    ORDER BY is_active DESC
    LIMIT 1;
  END IF;

  IF v_id IS NOT NULL THEN
    NEW.provider_id := v_id::text;
    NEW.provider_name := v_name;
  END IF;

  RETURN NEW;
END;
$function$;