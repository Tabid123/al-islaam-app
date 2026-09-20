
CREATE TABLE public.user_acquisition_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  source TEXT NOT NULL,
  other_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_acq_phone ON public.user_acquisition_sources(phone_number);
CREATE INDEX idx_user_acq_source ON public.user_acquisition_sources(source);
CREATE INDEX idx_user_acq_created ON public.user_acquisition_sources(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_acquisition_sources TO authenticated;
GRANT INSERT ON public.user_acquisition_sources TO anon;
GRANT ALL ON public.user_acquisition_sources TO service_role;

ALTER TABLE public.user_acquisition_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert acquisition source"
  ON public.user_acquisition_sources FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can view acquisition sources"
  ON public.user_acquisition_sources FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can delete acquisition sources"
  ON public.user_acquisition_sources FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));
