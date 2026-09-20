
CREATE OR REPLACE FUNCTION public.upsert_verified_phone_login(p_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clean text; v_existing uuid; v_is_new boolean := false;
BEGIN
  v_clean := regexp_replace(COALESCE(p_phone,''), '\s', '', 'g');
  IF v_clean IS NULL OR length(regexp_replace(v_clean,'\D','','g')) < 9 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid phone');
  END IF;
  SELECT id INTO v_existing FROM public.verified_phones WHERE phone_number = v_clean;
  IF v_existing IS NULL THEN
    INSERT INTO public.verified_phones(phone_number, verified_at, last_login_at)
    VALUES (v_clean, now(), now());
    v_is_new := true;
  ELSE
    UPDATE public.verified_phones SET last_login_at = now() WHERE id = v_existing;
  END IF;
  RETURN jsonb_build_object('success', true, 'is_new', v_is_new);
END; $$;
REVOKE ALL ON FUNCTION public.upsert_verified_phone_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_verified_phone_login(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_offline_registration(
  p_sender text, p_receiver text, p_provider_id text, p_provider_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_sender IS NULL OR p_receiver IS NULL OR length(p_sender) < 6 OR length(p_receiver) < 6 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid phones');
  END IF;
  INSERT INTO public.offline_registrations(sender_phone, receiver_phone, provider_id, provider_name, is_active)
  VALUES (p_sender, p_receiver, p_provider_id, p_provider_name, true)
  ON CONFLICT (sender_phone) DO UPDATE
    SET receiver_phone = EXCLUDED.receiver_phone,
        provider_id = EXCLUDED.provider_id,
        provider_name = EXCLUDED.provider_name,
        is_active = true,
        updated_at = now();
  RETURN jsonb_build_object('success', true);
END; $$;
REVOKE ALL ON FUNCTION public.save_offline_registration(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_offline_registration(text,text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_referral_summary(p_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text; v_points int := 0; v_total int := 0; v_redeemed boolean := false;
BEGIN
  SELECT code, points, total_referrals INTO v_code, v_points, v_total
  FROM public.referral_codes WHERE phone = p_phone;
  SELECT EXISTS(SELECT 1 FROM public.referral_redemptions WHERE referred_phone = p_phone) INTO v_redeemed;
  RETURN jsonb_build_object('code', v_code, 'points', COALESCE(v_points,0),
    'total_referrals', COALESCE(v_total,0), 'already_redeemed', v_redeemed);
END; $$;
REVOKE ALL ON FUNCTION public.get_referral_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_referral_summary(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_referral_code_exists(p_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.referral_codes WHERE code = upper(trim(p_code)));
$$;
REVOKE ALL ON FUNCTION public.check_referral_code_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_referral_code_exists(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_next_bulk_sms(p_device_id text, p_sim_slot int DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.bulk_sms_queue%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.bulk_sms_queue
  WHERE status = 'pending' AND device_id = p_device_id
    AND (p_sim_slot IS NULL OR sim_slot = p_sim_slot)
  ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.bulk_sms_queue SET status = 'processing' WHERE id = v_row.id;
  RETURN to_jsonb(v_row);
END; $$;
REVOKE ALL ON FUNCTION public.claim_next_bulk_sms(text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_bulk_sms(text,int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_order_selling_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_config_price numeric;
BEGIN
  IF NEW.package_id IS NOT NULL THEN
    SELECT selling_price INTO v_config_price FROM public.data_packages_config WHERE id = NEW.package_id;
    IF v_config_price IS NOT NULL AND NEW.selling_price <> v_config_price THEN
      NEW.selling_price := v_config_price;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_validate_order_selling_price ON public.orders;
CREATE TRIGGER trg_validate_order_selling_price
  BEFORE INSERT OR UPDATE OF selling_price, package_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_order_selling_price();
