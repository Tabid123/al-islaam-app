-- Earnings columns
ALTER TABLE public.referral_codes ADD COLUMN IF NOT EXISTS earnings numeric NOT NULL DEFAULT 0;
ALTER TABLE public.referral_redemptions ADD COLUMN IF NOT EXISTS amount_awarded numeric NOT NULL DEFAULT 0.05;

-- Users can no longer self-create codes
DROP FUNCTION IF EXISTS public.get_or_create_referral_code(text);

-- User-facing: read-only, no money exposed
CREATE OR REPLACE FUNCTION public.get_my_referral_code(p_phone text)
RETURNS TABLE(code text, total_referrals integer, already_redeemed boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT rc.code, rc.total_referrals,
         EXISTS(SELECT 1 FROM public.referral_redemptions r WHERE r.referred_phone = p_phone)
  FROM public.referral_codes rc
  WHERE rc.phone = p_phone;
$$;

-- Admin issues a code to a user
CREATE OR REPLACE FUNCTION public.admin_create_referral_code(p_phone text, p_code text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_code text; v_phone text; v_attempts int := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;

  v_phone := regexp_replace(COALESCE(p_phone,''), '\D', '', 'g');
  IF length(v_phone) = 12 AND left(v_phone,3) = '252' THEN v_phone := substring(v_phone from 4); END IF;
  IF length(v_phone) = 10 AND left(v_phone,1) = '0' THEN v_phone := substring(v_phone from 2); END IF;
  IF length(v_phone) < 9 THEN
    RETURN json_build_object('success', false, 'message', 'Lambar sax ah geli');
  END IF;

  IF EXISTS (SELECT 1 FROM public.referral_codes WHERE phone = v_phone) THEN
    RETURN json_build_object('success', false, 'message', 'Lambarkan hore ayuu code u leeyahay');
  END IF;

  IF p_code IS NOT NULL AND length(trim(p_code)) >= 4 THEN
    v_code := upper(trim(p_code));
    IF EXISTS (SELECT 1 FROM public.referral_codes WHERE code = v_code) THEN
      RETURN json_build_object('success', false, 'message', 'Code-kan hore ayuu u jiray');
    END IF;
    INSERT INTO public.referral_codes(phone, code) VALUES (v_phone, v_code);
  ELSE
    LOOP
      v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
      BEGIN
        INSERT INTO public.referral_codes(phone, code) VALUES (v_phone, v_code);
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        v_attempts := v_attempts + 1;
        IF v_attempts > 10 THEN RAISE; END IF;
      END;
    END LOOP;
  END IF;

  RETURN json_build_object('success', true, 'code', v_code, 'phone', v_phone);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_delete_referral_code(p_phone text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM public.referral_codes WHERE phone = p_phone;
  RETURN json_build_object('success', true);
END; $$;

-- Reset both money and points
CREATE OR REPLACE FUNCTION public.admin_reset_referral_points(p_phone text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.referral_codes SET points = 0, earnings = 0, updated_at = now() WHERE phone = p_phone;
  RETURN json_build_object('success', true);
END; $$;

-- Applying a code now pays the referrer $0.05
CREATE OR REPLACE FUNCTION public.apply_referral_code(p_code text, p_new_phone text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referrer public.referral_codes%ROWTYPE;
  v_code TEXT;
  v_amount numeric := 0.05;
BEGIN
  v_code := upper(trim(p_code));

  IF v_code IS NULL OR length(v_code) < 4 THEN
    RETURN json_build_object('success', false, 'message', 'Code sax ah geli');
  END IF;

  SELECT * INTO v_referrer FROM public.referral_codes WHERE code = v_code;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Code-kani ma jiro');
  END IF;

  IF v_referrer.phone = p_new_phone THEN
    RETURN json_build_object('success', false, 'message', 'Naftaada iskuma casuumi kartid');
  END IF;

  IF EXISTS (SELECT 1 FROM public.referral_redemptions WHERE referred_phone = p_new_phone) THEN
    RETURN json_build_object('success', false, 'message', 'Hore ayaad u isticmaashay code');
  END IF;

  INSERT INTO public.referral_redemptions(referrer_phone, referred_phone, code_used, points_awarded, amount_awarded)
  VALUES (v_referrer.phone, p_new_phone, v_code, 0, v_amount);

  UPDATE public.referral_codes
    SET earnings = earnings + v_amount,
        total_referrals = total_referrals + 1,
        updated_at = now()
    WHERE phone = v_referrer.phone;

  RETURN json_build_object('success', true, 'message', 'Waad ku mahadsan tahay!');
END; $$;

-- Admin-only full list including money
CREATE OR REPLACE FUNCTION public.admin_referral_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT jsonb_build_object(
    'codes', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.earnings DESC)
                       FROM (SELECT * FROM public.referral_codes LIMIT 1000) c), '[]'::jsonb),
    'redemptions', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC)
                       FROM (SELECT * FROM public.referral_redemptions ORDER BY created_at DESC LIMIT 1000) r), '[]'::jsonb),
    'total_earnings', COALESCE((SELECT SUM(earnings) FROM public.referral_codes), 0)
  ) INTO result;
  RETURN result;
END; $$;

-- get_referral_summary must not expose money
CREATE OR REPLACE FUNCTION public.get_referral_summary(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_code text; v_total int := 0; v_redeemed boolean := false;
BEGIN
  SELECT code, total_referrals INTO v_code, v_total
  FROM public.referral_codes WHERE phone = p_phone;
  SELECT EXISTS(SELECT 1 FROM public.referral_redemptions WHERE referred_phone = p_phone) INTO v_redeemed;
  RETURN jsonb_build_object('code', v_code, 'total_referrals', COALESCE(v_total,0), 'already_redeemed', v_redeemed);
END; $$;

REVOKE ALL ON FUNCTION public.admin_create_referral_code(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_delete_referral_code(text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_referral_overview() FROM anon;