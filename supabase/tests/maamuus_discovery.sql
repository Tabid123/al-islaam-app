-- Run as a database owner. Rollback keeps test scans invisible to Android workers.
BEGIN;
DO $$
DECLARE root_id uuid; first_id uuid; next_id uuid; protected_order uuid; response jsonb; result jsonb;
BEGIN
  SELECT p.id INTO root_id FROM public.data_packages_config p
  JOIN public.providers_config pr ON pr.id=p.provider_id
  WHERE p.is_discovery_root=true AND p.is_active=true AND pr.is_active=true
    AND p.package_name='Data' ORDER BY p.id LIMIT 1;
  ASSERT root_id IS NOT NULL, 'Active Data discovery root required';
  response := public.request_package_discovery(root_id,'bad');
  ASSERT response->>'success'='false', 'Invalid phone accepted';
  response := public.request_package_discovery(NULL,'619999998');
  ASSERT response->>'success'='false', 'Missing root accepted';
  response := public.request_package_discovery(root_id,'+252 619 999 998');
  ASSERT response->>'success'='true' AND response->>'status'='pending', 'Request contract mismatch';
  first_id := (response->>'id')::uuid;
  response := public.request_package_discovery(root_id,'0619999998');
  ASSERT (response->>'id')::uuid=first_id, 'Concurrent request not reused';
  UPDATE public.ussd_package_discoveries SET status='processing',claimed_at=now() WHERE id=first_id;
  response := public.get_discovery_queue_status(first_id);
  ASSERT response->>'found'='true' AND response->>'status'='processing' AND response->>'claimed_at' IS NOT NULL,
    'Processing queue contract mismatch';
  PERFORM public.complete_discovery(first_id,'Test menu','[
    {"index":"1","label":"$0.1=Internet aan xadidnayn, 1 Saac"},
    {"index":"2","label":"$0.15=Internet aan xadidneyn,3 hours"},
    {"index":"3","label":"Unlisted offer, 999 Maalin"},
    {"index":"4","label":"Unlisted offer, 999 Maalin"}
  ]'::jsonb,NULL,true);
  result := public.get_package_discovery(first_id);
  ASSERT result->>'success'='true' AND result->>'status'='done', 'Result contract mismatch';
  ASSERT jsonb_array_length(result->'packages')=4, 'Unmatched or duplicate carrier rows discarded';
  ASSERT (result->'packages'->0->>'selling_price')::numeric=0.11, 'Carrier price used instead of admin price';
  ASSERT (result->'packages'->1->>'selling_price')::numeric=0.17, 'Spelling/unit variations not matched';
  ASSERT result->'packages'->2->>'price_missing'='true', 'Unknown offer silently priced';
  ASSERT result::text NOT LIKE '%cost_price%', 'Cost exposed in storefront response';
  ASSERT (result->>'session_seconds_left')::int > 0, 'Open session lost';
  UPDATE public.ussd_package_discoveries SET session_expires_at=now()-interval '1 second' WHERE id=first_id;
  ASSERT public.get_package_discovery(first_id)->>'session_seconds_left'='0', 'Expired hold renewed';
  response := public.request_package_discovery(root_id,'619999998');
  next_id := (response->>'id')::uuid;
  ASSERT next_id<>first_id, 'Completed menu reused on re-scan';
  PERFORM public.release_discovery_session(next_id);
  response := public.get_discovery_queue_status(next_id);
  ASSERT response->>'status'='failed' AND response->>'session_state'='closed', 'Cancelled scan still claimable';
  response := public.complete_discovery(next_id,'Late Android result','[]'::jsonb,NULL,true);
  ASSERT response->>'success'='false', 'Late completion reopened cancelled scan';
  SELECT id INTO protected_order FROM public.orders ORDER BY created_at DESC LIMIT 1;
  IF protected_order IS NOT NULL THEN
    UPDATE public.ussd_package_discoveries SET session_state='selected',selected_order_id=protected_order WHERE id=first_id;
    PERFORM public.release_discovery_session(first_id);
    ASSERT public.get_discovery_queue_status(first_id)->>'session_state'='selected', 'Purchased selection released';
  END IF;
END;
$$;
SELECT 'maamuus discovery regression checks passed' AS result;
ROLLBACK;
