BEGIN;
DO $$
DECLARE p public.data_packages_config%ROWTYPE; o uuid; q uuid; other uuid;
BEGIN
  IF has_function_privilege('anon','public.enqueue_somlink_delivery(uuid)','EXECUTE') OR
     has_function_privilege('authenticated','public.enqueue_somlink_delivery(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Queue RPC must be private';
  END IF;
  SELECT d.* INTO p FROM public.data_packages_config d JOIN public.providers_config v ON v.id=d.provider_id
    WHERE lower(v.provider_name)='somlink' AND d.somlink_bundle_id > 0 LIMIT 1;
  INSERT INTO public.orders(customer_phone,receiver_phone,package_id,provider_id,package_name,selling_price,cost_price,status,delivery_status,scheduled_for)
    VALUES('640000000','640000000',p.id,p.provider_id,p.package_name,p.selling_price,p.cost_price,'completed','pending',now()+interval '1 hour') RETURNING id INTO o;
  q := public.enqueue_somlink_delivery(o);
  other := public.enqueue_somlink_delivery(o);
  IF q IS DISTINCT FROM other OR (SELECT count(*) FROM public.delivery_queue WHERE order_id=o)<>1 THEN RAISE EXCEPTION 'Duplicate queue'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.delivery_queue WHERE id=q AND status='pending' AND scheduled_at>now() AND ussd_code IS NULL AND provider_name='Somlink') THEN RAISE EXCEPTION 'Invalid API queue'; END IF;
  UPDATE public.delivery_queue SET status='failed' WHERE id=q;
  PERFORM public.enqueue_somlink_delivery(o);
  IF (SELECT status FROM public.delivery_queue WHERE id=q)<>'failed' THEN RAISE EXCEPTION 'Unsafe retry'; END IF;
  UPDATE public.orders SET status='pending' WHERE id=o;
  BEGIN
    PERFORM public.enqueue_somlink_delivery(o);
    RAISE EXCEPTION 'Accepted unpaid order';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'Paid order required' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;
