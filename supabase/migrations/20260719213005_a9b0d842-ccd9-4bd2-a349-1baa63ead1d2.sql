
-- ============ REFERRAL CODES TABLE ============
CREATE TABLE public.referral_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  points INTEGER NOT NULL DEFAULT 0,
  total_referrals INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.referral_codes TO anon;
GRANT SELECT, INSERT, UPDATE ON public.referral_codes TO authenticated;
GRANT ALL ON public.referral_codes TO service_role;

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view referral codes"
  ON public.referral_codes FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert own referral code"
  ON public.referral_codes FOR INSERT
  WITH CHECK (true);

CREATE TRIGGER update_referral_codes_updated_at
  BEFORE UPDATE ON public.referral_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ REFERRAL REDEMPTIONS TABLE ============
CREATE TABLE public.referral_redemptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_phone TEXT NOT NULL,
  referred_phone TEXT NOT NULL UNIQUE,
  code_used TEXT NOT NULL,
  points_awarded INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_referral_redemptions_referrer ON public.referral_redemptions(referrer_phone);

GRANT SELECT, INSERT ON public.referral_redemptions TO anon;
GRANT SELECT, INSERT ON public.referral_redemptions TO authenticated;
GRANT ALL ON public.referral_redemptions TO service_role;

ALTER TABLE public.referral_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view redemptions"
  ON public.referral_redemptions FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert redemption"
  ON public.referral_redemptions FOR INSERT
  WITH CHECK (true);

-- ============ HELPER: GET OR CREATE CODE ============
CREATE OR REPLACE FUNCTION public.get_or_create_referral_code(p_phone TEXT)
RETURNS TABLE(code TEXT, points INTEGER, total_referrals INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_existing RECORD;
  v_attempts INT := 0;
BEGIN
  SELECT rc.code, rc.points, rc.total_referrals
    INTO v_existing
    FROM public.referral_codes rc
    WHERE rc.phone = p_phone;

  IF FOUND THEN
    RETURN QUERY SELECT v_existing.code, v_existing.points, v_existing.total_referrals;
    RETURN;
  END IF;

  LOOP
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    BEGIN
      INSERT INTO public.referral_codes(phone, code)
      VALUES (p_phone, v_code);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_attempts := v_attempts + 1;
      IF v_attempts > 10 THEN RAISE; END IF;
    END;
  END LOOP;

  RETURN QUERY SELECT v_code, 0, 0;
END;
$$;

-- ============ APPLY REFERRAL CODE ============
CREATE OR REPLACE FUNCTION public.apply_referral_code(p_code TEXT, p_new_phone TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer public.referral_codes%ROWTYPE;
  v_code TEXT;
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

  INSERT INTO public.referral_redemptions(referrer_phone, referred_phone, code_used, points_awarded)
  VALUES (v_referrer.phone, p_new_phone, v_code, 3);

  UPDATE public.referral_codes
    SET points = points + 3,
        total_referrals = total_referrals + 1,
        updated_at = now()
    WHERE phone = v_referrer.phone;

  RETURN json_build_object('success', true, 'message', 'Waad ku mahadsan tahay!', 'points_awarded', 3);
END;
$$;

-- ============ ADMIN: RESET POINTS ============
CREATE OR REPLACE FUNCTION public.admin_reset_referral_points(p_phone TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN json_build_object('success', false, 'message', 'Ma awoodo');
  END IF;

  UPDATE public.referral_codes SET points = 0, updated_at = now() WHERE phone = p_phone;
  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_referral_code(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_referral_code(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_referral_points(TEXT) TO authenticated;
