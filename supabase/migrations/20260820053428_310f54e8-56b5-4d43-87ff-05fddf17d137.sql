ALTER TABLE public.data_packages_config ADD COLUMN IF NOT EXISTS is_ussd_only boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_public_packages(p_provider_id uuid)
 RETURNS SETOF data_packages_config
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.data_packages_config
  WHERE is_active = true AND provider_id = p_provider_id AND is_ussd_only = false
  ORDER BY display_order, selling_price;
$function$;