CREATE OR REPLACE FUNCTION public.fill_delivery_pin_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin text;
  v_package_id uuid;
  v_provider_id uuid;
  v_category_id uuid;
BEGIN
  IF NEW.pin_code IS NOT NULL AND length(regexp_replace(NEW.pin_code, '\D', '', 'g')) >= 3 THEN
    RETURN NEW;
  END IF;

  SELECT o.package_id, o.provider_id INTO v_package_id, v_provider_id
  FROM public.orders o WHERE o.id = NEW.order_id;

  IF v_package_id IS NOT NULL THEN
    SELECT d.sim_password, d.category_id INTO v_pin, v_category_id
    FROM public.data_packages_config d WHERE d.id = v_package_id;
  END IF;

  IF v_pin IS NULL OR length(regexp_replace(COALESCE(v_pin,''), '\D', '', 'g')) < 3 THEN
    SELECT di.sim_password INTO v_pin
    FROM public.delivery_instructions di
    WHERE di.sim_password IS NOT NULL
      AND (
        (v_package_id IS NOT NULL AND di.package_id = v_package_id)
        OR (v_category_id IS NOT NULL AND di.package_id IS NULL AND di.category_id = v_category_id)
        OR (v_provider_id IS NOT NULL AND di.package_id IS NULL AND di.category_id IS NULL AND di.provider_id = v_provider_id)
      )
    ORDER BY (di.package_id IS NOT NULL) DESC, (di.category_id IS NOT NULL) DESC
    LIMIT 1;
  END IF;

  IF v_pin IS NOT NULL AND length(regexp_replace(v_pin, '\D', '', 'g')) >= 3 THEN
    NEW.pin_code := regexp_replace(v_pin, '\D', '', 'g');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_delivery_pin_code ON public.delivery_queue;
CREATE TRIGGER trg_fill_delivery_pin_code
BEFORE INSERT ON public.delivery_queue
FOR EACH ROW EXECUTE FUNCTION public.fill_delivery_pin_code();

UPDATE public.delivery_queue q
SET pin_code = regexp_replace(d.sim_password, '\D', '', 'g')
FROM public.orders o
JOIN public.data_packages_config d ON d.id = o.package_id
WHERE q.order_id = o.id
  AND q.status IN ('pending','processing')
  AND (q.pin_code IS NULL OR length(regexp_replace(COALESCE(q.pin_code,''), '\D', '', 'g')) < 3)
  AND d.sim_password IS NOT NULL
  AND length(regexp_replace(d.sim_password, '\D', '', 'g')) >= 3;