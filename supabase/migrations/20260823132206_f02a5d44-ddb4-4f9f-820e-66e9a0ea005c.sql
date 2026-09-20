CREATE OR REPLACE FUNCTION public.enqueue_discovery_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_root record;
  v_provider text;
  v_label text;
  v_menu1 text;
  v_code text;
BEGIN
  IF NEW.package_id IS NULL THEN RETURN NEW; END IF;

  SELECT p.id, p.package_name, p.is_discovery_root, pr.provider_name
    INTO v_root
  FROM public.data_packages_config p
  LEFT JOIN public.providers_config pr ON pr.id = p.provider_id
  WHERE p.id = NEW.package_id;

  IF NOT FOUND OR COALESCE(v_root.is_discovery_root, false) = false THEN
    RETURN NEW;
  END IF;

  -- already queued?
  IF EXISTS (SELECT 1 FROM public.delivery_queue q WHERE q.order_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_label := NULLIF(btrim(COALESCE(NEW.discovery_menu_label, '')), '');

  IF v_label IS NULL THEN
    SELECT pop.discovery_menu_label INTO v_label
    FROM public.pending_online_payments pop
    WHERE pop.package_id = NEW.package_id
      AND pop.receiver_phone = NEW.receiver_phone
      AND pop.discovery_menu_label IS NOT NULL
      AND pop.created_at > now() - interval '3 hours'
    ORDER BY abs(pop.expected_amount - NEW.selling_price), pop.created_at DESC
    LIMIT 1;
  END IF;

  IF v_label IS NULL THEN RETURN NEW; END IF;

  UPDATE public.orders
     SET discovery_menu_label = v_label,
         discovery_root_id = NEW.package_id
   WHERE id = NEW.id;

  v_menu1 := replace(COALESCE(v_root.package_name, 'Data'), ',', ' ');
  v_code := '*212*' || regexp_replace(NEW.receiver_phone, '[^0-9]', '', 'g') || '#|'
            || v_menu1 || ',' || replace(public.ussd_strip_price_prefix(v_label), ',', ' ');
  v_provider := lower(COALESCE(v_root.provider_name, 'hormuud'));

  INSERT INTO public.delivery_queue (order_id, provider_name, receiver_phone, ussd_code, status, attempts, discovery_menu_label)
  VALUES (NEW.id, v_provider, NEW.receiver_phone, v_code, 'pending', 0, v_label);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_discovery_delivery_ins ON public.orders;
CREATE TRIGGER trg_enqueue_discovery_delivery_ins
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enqueue_discovery_delivery();

DROP TRIGGER IF EXISTS trg_enqueue_discovery_delivery_upd ON public.orders;
CREATE TRIGGER trg_enqueue_discovery_delivery_upd
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (NEW.status IN ('paid','completed') AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.enqueue_discovery_delivery();

-- Backfill: re-trigger enqueue for recent discovery orders without a delivery row
UPDATE public.orders o
SET delivery_status = 'pending', status = 'paid'
FROM public.data_packages_config p
WHERE p.id = o.package_id
  AND p.is_discovery_root
  AND o.created_at > now() - interval '1 day'
  AND NOT EXISTS (SELECT 1 FROM public.delivery_queue q WHERE q.order_id = o.id);