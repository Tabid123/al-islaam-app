DELETE FROM public.user_acquisition_sources a
USING public.user_acquisition_sources b
WHERE a.phone_number = b.phone_number
  AND (a.created_at > b.created_at OR (a.created_at = b.created_at AND a.id > b.id));

CREATE UNIQUE INDEX IF NOT EXISTS user_acquisition_sources_phone_unique
  ON public.user_acquisition_sources (phone_number);