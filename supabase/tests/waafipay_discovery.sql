-- Everything is rolled back; no charge, order or Android job leaves this test.
BEGIN;
DO $$
DECLARE root_id uuid; payment_id uuid; scan_id uuid; scan2 uuid; tx_id uuid; tx2 uuid;
  offer jsonb; response jsonb; second_response jsonb; order_row public.orders%ROWTYPE; code text; rejected boolean;
BEGIN
  ASSERT NOT has_function_privilege('anon','public.waafipay_resolve_discovery_offer(uuid,uuid,text,text,numeric)','EXECUTE'), 'Public price/cost resolver';
  ASSERT NOT has_function_privilege('authenticated','public.waafipay_finalize_discovery_purchase(uuid)','EXECUTE'), 'Public fulfillment mutation';
  SELECT p.id INTO root_id FROM public.data_packages_config p JOIN public.providers_config pr ON pr.id=p.provider_id
    WHERE p.is_active AND p.is_discovery_root AND p.package_name='Data' AND pr.is_active ORDER BY p.id LIMIT 1;
  SELECT id INTO payment_id FROM public.payment_providers_config WHERE is_active AND payment_mode='waafipay_api' ORDER BY id LIMIT 1;
  ASSERT root_id IS NOT NULL AND payment_id IS NOT NULL, 'Active catalog/payment required';
  scan_id := (public.request_package_discovery(root_id,'619999998')->>'id')::uuid;
  PERFORM public.complete_discovery(scan_id,'Test','[{"index":"3","label":"$0.1=Internet aan xadidnayn, 1 Saac"}]',NULL,true);
  ASSERT public.waafipay_resolve_discovery_offer(scan_id,root_id,'619999997','3',0.11)->>'success'='false', 'Wrong receiver accepted';
  ASSERT public.waafipay_resolve_discovery_offer(scan_id,root_id,'619999998','9',0.11)->>'success'='false', 'Wrong menu index accepted';
  ASSERT public.waafipay_resolve_discovery_offer(scan_id,root_id,'619999998','3',0.01)->>'error'='discovery_price_changed', 'Client price accepted';
  response:=public.waafipay_resolve_discovery_offer(scan_id,root_id,'619999998','3',0.11);
  ASSERT response->>'success'='true', 'Valid offer rejected';
  offer:=(response->'offer')||jsonb_build_object('provider_slug','hormuud');
  INSERT INTO public.waafipay_transactions(client_reference,reference_id,request_id,payer_phone,receiver_phone,
    package_id,payment_provider_id,amount,currency,environment,status,waafi_transaction_id,raw_response)
  VALUES(gen_random_uuid()::text,gen_random_uuid()::text,gen_random_uuid(),'619999997','619999998',root_id,payment_id,
    0.11,'USD','sandbox','processing',gen_random_uuid()::text,jsonb_build_object('request_context',
      jsonb_build_object('customer_phone','619999996','discovery',offer))) RETURNING id INTO tx_id;
  rejected:=false;
  BEGIN PERFORM public.waafipay_finalize_discovery_purchase(tx_id);
  EXCEPTION WHEN raise_exception THEN rejected:=SQLERRM='An approved WaafiPay transaction is required'; END;
  ASSERT rejected,'Unapproved transaction fulfilled';
  UPDATE public.waafipay_transactions SET status='approved' WHERE id=tx_id;
  response:=public.waafipay_finalize_discovery_purchase(tx_id);
  second_response:=public.waafipay_finalize_discovery_purchase(tx_id);
  ASSERT response->>'order_id'=second_response->>'order_id', 'Retry made another order';
  ASSERT response->>'delivery_queued'='true', 'Live selection not recognized as queued';
  SELECT * INTO order_row FROM public.orders WHERE id=(response->>'order_id')::uuid;
  ASSERT order_row.customer_phone='619999996' AND order_row.sender_phone='619999997' AND order_row.receiver_phone='619999998', 'Phone ownership mixed';
  ASSERT order_row.selling_price=0.11 AND order_row.cost_price=0.10, 'Root price/cost used';
  ASSERT order_row.package_name='Internet aan xadidnayn, 1 Saac' AND order_row.discovery_root_id=root_id, 'Offer identity lost';
  ASSERT (SELECT session_state FROM public.ussd_package_discoveries WHERE id=scan_id)='selected', 'Live menu not selected';
  ASSERT NOT EXISTS(SELECT 1 FROM public.delivery_queue WHERE order_id=order_row.id), 'Duplicate live-session and queue delivery';

  -- The menu can expire during PIN entry after its price was validated.
  scan2 := (public.request_package_discovery(root_id,'619999998')->>'id')::uuid;
  PERFORM public.complete_discovery(scan2,'Test','[{"index":"3","label":"$0.1=Internet aan xadidnayn, 1 Saac"}]',NULL,true);
  offer:=(public.waafipay_resolve_discovery_offer(scan2,root_id,'619999998','3',0.11)->'offer')||jsonb_build_object('provider_slug','hormuud');
  UPDATE public.ussd_package_discoveries SET session_state='lost',session_expires_at=now()-interval '1 second' WHERE id=scan2;
  ASSERT public.waafipay_resolve_discovery_offer(scan2,root_id,'619999998','3',0.11)->>'error'='discovery_expired','Expired offer accepted for new debit';
  INSERT INTO public.waafipay_transactions(client_reference,reference_id,request_id,payer_phone,receiver_phone,
    package_id,payment_provider_id,amount,currency,environment,status,waafi_transaction_id,raw_response)
  VALUES(gen_random_uuid()::text,gen_random_uuid()::text,gen_random_uuid(),'619999997','619999998',root_id,payment_id,
    0.11,'USD','sandbox','approved',gen_random_uuid()::text,jsonb_build_object('request_context',
      jsonb_build_object('customer_phone','619999996','discovery',offer))) RETURNING id INTO tx2;
  response:=public.waafipay_finalize_discovery_purchase(tx2);
  PERFORM public.waafipay_finalize_discovery_purchase(tx2);
  ASSERT response->>'delivery_queued'='true','Expired-after-approval delivery missing';
  ASSERT (SELECT count(*) FROM public.delivery_queue WHERE order_id=(response->>'order_id')::uuid)=1,'Fallback queued twice';
  SELECT ussd_code INTO code FROM public.delivery_queue WHERE order_id=(response->>'order_id')::uuid;
  ASSERT code='*212*619999998#|Data,$0.1=Internet aan xadidnayn  1 Saac','Fallback lost carrier label/price';
END;
$$;
SELECT 'waafipay discovery checks passed' AS result;
ROLLBACK;
