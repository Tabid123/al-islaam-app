-- Riyokaab dispatcher uses pending rows with scheduled_at as the due-time gate.
-- API deliveries have no USSD instruction. Share a row lock with checkout and recovery.
CREATE OR REPLACE FUNCTION public.enqueue_somlink_delivery(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE o public.orders%ROWTYPE; q uuid;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.status NOT IN ('paid','completed','payment_confirmed') THEN
    RAISE EXCEPTION 'Paid order required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.data_packages_config p JOIN public.providers_config v ON v.id=p.provider_id
    WHERE p.id=o.package_id AND lower(v.provider_name)='somlink' AND p.somlink_bundle_id > 0 AND p.cost_price > 0) THEN
    RAISE EXCEPTION 'Somlink package not configured';
  END IF;
  SELECT id INTO q FROM public.delivery_queue WHERE order_id=o.id ORDER BY created_at LIMIT 1;
  IF q IS NOT NULL OR o.delivery_status='delivered' THEN RETURN q; END IF;
  INSERT INTO public.delivery_queue(order_id,receiver_phone,provider_name,status,scheduled_at)
  VALUES(o.id,o.receiver_phone,'Somlink','pending',coalesce(o.scheduled_for,now()))
  RETURNING id INTO q;
  RETURN q;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_somlink_delivery(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_somlink_delivery(uuid) TO service_role;

