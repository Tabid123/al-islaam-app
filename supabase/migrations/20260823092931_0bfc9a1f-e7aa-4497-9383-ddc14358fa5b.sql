CREATE OR REPLACE FUNCTION public.validate_order_selling_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_config_price numeric; v_is_discovery boolean;
BEGIN
  IF NEW.package_id IS NOT NULL THEN
    SELECT selling_price, COALESCE(is_discovery_root,false)
      INTO v_config_price, v_is_discovery
    FROM public.data_packages_config WHERE id = NEW.package_id;

    IF COALESCE(v_is_discovery,false) THEN
      RETURN NEW;
    END IF;

    IF v_config_price IS NOT NULL AND NEW.selling_price <> v_config_price THEN
      NEW.selling_price := v_config_price;
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

ALTER TABLE public.delivery_queue
  ADD COLUMN IF NOT EXISTS discovery_menu_label text;