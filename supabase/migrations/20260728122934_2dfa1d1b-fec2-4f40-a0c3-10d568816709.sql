DO $$
DECLARE
  v_provider uuid := '7a0dd0bd-ee3d-4f86-abd0-10f0a1d8c6cc';
  v_kaafiye uuid;
  v_kulmis uuid;
  v_promo uuid;
BEGIN
  INSERT INTO public.package_categories (provider_id, category_name, display_order, is_active)
  VALUES (v_provider, 'Kaafiye', 1, true) RETURNING id INTO v_kaafiye;

  INSERT INTO public.package_categories (provider_id, category_name, display_order, is_active)
  VALUES (v_provider, 'Kulmis', 2, true) RETURNING id INTO v_kulmis;

  INSERT INTO public.package_categories (provider_id, category_name, display_order, is_active)
  VALUES (v_provider, 'Promotion', 3, true) RETURNING id INTO v_promo;

  -- Kaafiye
  INSERT INTO public.data_packages_config
    (provider_id, category_id, package_name, data_amount, validity_days, selling_price, cost_price, connection_type_label, display_order, is_active, somlink_bundle_id)
  VALUES
    (v_provider, v_kaafiye, 'Kaafiye 1GB+1GB', '1GB+1GB', '30', 0.5, 0.5, 'Data', 1, true, 20060),
    (v_provider, v_kaafiye, 'Kaafiye 3GB+3GB', '3GB+3GB', '30', 1, 1, 'Data', 2, true, 20061),
    (v_provider, v_kaafiye, 'Kaafiye 16GB+16GB', '16GB+16GB', '30', 5, 5, 'Data', 3, true, 20062),
    (v_provider, v_kaafiye, 'Kaafiye 35GB+35GB', '35GB+35GB', '30', 10, 10, 'Data', 4, true, 20063),
    (v_provider, v_kaafiye, 'Night 2GB (10PM-7AM)', '2GB', '1', 0.2, 0.2, 'Night', 5, true, 30);

  -- Kulmis
  INSERT INTO public.data_packages_config
    (provider_id, category_id, package_name, data_amount, validity_days, selling_price, cost_price, connection_type_label, display_order, is_active, somlink_bundle_id)
  VALUES
    (v_provider, v_kulmis, 'Kulmis 900MB+30Min+50SMS', '900MB+30Min+50SMS', '30', 0.5, 0.5, 'Data+Min+SMS', 1, true, 25),
    (v_provider, v_kulmis, 'Kulmis 2GB+150Min+70SMS', '2GB+150Min+70SMS', '30', 1, 1, 'Data+Min+SMS', 2, true, 24),
    (v_provider, v_kulmis, 'Kulmis 13GB+500Min+200SMS', '13GB+500Min+200SMS', '30', 5, 5, 'Data+Min+SMS', 3, true, 26),
    (v_provider, v_kulmis, 'Kulmis 30GB+700Min+300SMS', '30GB+700Min+300SMS', '60', 10, 10, 'Data+Min+SMS', 4, true, 27);

  -- Promotion (Unlimited)
  INSERT INTO public.data_packages_config
    (provider_id, category_id, package_name, data_amount, validity_days, selling_price, cost_price, connection_type_label, display_order, is_active, somlink_bundle_id)
  VALUES
    (v_provider, v_promo, 'Unlimited 24hr', 'Unlimited', '1', 0.5, 0.5, 'Unlimited', 1, true, 20071),
    (v_provider, v_promo, 'Unlimited 7 days', 'Unlimited', '7', 3, 3, 'Unlimited', 2, true, 20094),
    (v_provider, v_promo, 'Unlimited 10 days', 'Unlimited', '10', 1, 1, 'Unlimited', 3, true, 20103),
    (v_provider, v_promo, 'Unlimited 30 days', 'Unlimited', '30', 15, 15, 'Unlimited', 4, true, 11);
END $$;