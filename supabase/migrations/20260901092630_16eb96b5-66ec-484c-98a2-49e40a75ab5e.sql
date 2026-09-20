
CREATE OR REPLACE FUNCTION public.fill_delivery_pin_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pin text;
  v_package_id uuid;
  v_provider_id uuid;
  v_category_id uuid;
BEGIN
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

  -- Always prefer the currently configured PIN so admin edits take effect immediately.
  IF v_pin IS NOT NULL AND length(regexp_replace(v_pin, '\D', '', 'g')) >= 3 THEN
    NEW.pin_code := regexp_replace(v_pin, '\D', '', 'g');
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_customer_scheduled_orders(customer_phone_number text)
RETURNS TABLE(
  id uuid,
  created_at timestamp with time zone,
  scheduled_for timestamp with time zone,
  package_name text,
  data_amount text,
  selling_price numeric,
  receiver_phone text,
  status text,
  delivery_status text,
  provider_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH norm AS (
    SELECT regexp_replace(COALESCE(customer_phone_number,''), '\D', '', 'g') AS raw
  ), target AS (
    SELECT CASE
      WHEN length(raw) = 12 AND left(raw,3) = '252' THEN substring(raw from 4)
      WHEN length(raw) = 10 AND left(raw,1) = '0'   THEN substring(raw from 2)
      ELSE raw
    END AS phone
    FROM norm
  )
  SELECT
    o.id, o.created_at, o.scheduled_for, o.package_name, o.data_amount,
    o.selling_price, o.receiver_phone, o.status, o.delivery_status,
    COALESCE(p.provider_name, '')
  FROM public.orders o
  LEFT JOIN public.providers_config p ON p.id = o.provider_id
  CROSS JOIN target t
  WHERE t.phone <> ''
    AND o.scheduled_for IS NOT NULL
    AND (
      regexp_replace(COALESCE(o.customer_phone,''), '\D', '', 'g') LIKE '%' || t.phone
      OR regexp_replace(COALESCE(o.sender_phone,''), '\D', '', 'g') LIKE '%' || t.phone
    )
  ORDER BY o.scheduled_for ASC
  LIMIT 200;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_scheduled_order(p_order_id uuid, customer_phone_number text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_phone text;
  v_count int;
BEGIN
  v_phone := regexp_replace(COALESCE(customer_phone_number,''), '\D', '', 'g');
  IF length(v_phone) = 12 AND left(v_phone,3) = '252' THEN v_phone := substring(v_phone from 4); END IF;
  IF length(v_phone) = 10 AND left(v_phone,1) = '0' THEN v_phone := substring(v_phone from 2); END IF;
  IF v_phone = '' THEN RETURN false; END IF;

  UPDATE public.orders o
  SET status = 'cancelled'
  WHERE o.id = p_order_id
    AND o.scheduled_for IS NOT NULL
    AND o.scheduled_for > now()
    AND COALESCE(o.delivery_status,'') <> 'delivered'
    AND (
      regexp_replace(COALESCE(o.customer_phone,''), '\D', '', 'g') LIKE '%' || v_phone
      OR regexp_replace(COALESCE(o.sender_phone,''), '\D', '', 'g') LIKE '%' || v_phone
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_customer_scheduled_orders(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_scheduled_order(uuid, text) TO anon, authenticated;
