CREATE TABLE public.offline_payment_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  ussd_prefix text,
  label text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.offline_payment_numbers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offline_payment_numbers TO authenticated;
GRANT ALL ON public.offline_payment_numbers TO service_role;

ALTER TABLE public.offline_payment_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active offline payment numbers"
ON public.offline_payment_numbers FOR SELECT
USING (is_active = true OR public.is_admin());

CREATE POLICY "Admins manage offline payment numbers"
ON public.offline_payment_numbers FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TRIGGER update_offline_payment_numbers_updated_at
BEFORE UPDATE ON public.offline_payment_numbers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.offline_payment_numbers (phone_number, ussd_prefix, label, display_order)
SELECT
  (SELECT text_value FROM public.app_settings WHERE setting_key = 'payment_number'),
  (SELECT text_value FROM public.app_settings WHERE setting_key = 'payment_prefix'),
  'Default',
  0
WHERE EXISTS (
  SELECT 1 FROM public.app_settings
  WHERE setting_key = 'payment_number' AND coalesce(text_value, '') <> ''
);