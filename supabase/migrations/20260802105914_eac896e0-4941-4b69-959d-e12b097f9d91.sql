CREATE TABLE public.ussd_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sessionid text NOT NULL UNIQUE,
  origin text NOT NULL,
  shortcode text,
  step text NOT NULL DEFAULT 'start',
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_input text,
  is_closed boolean NOT NULL DEFAULT false,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ussd_sessions TO authenticated;
GRANT ALL ON public.ussd_sessions TO service_role;

ALTER TABLE public.ussd_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ussd sessions"
ON public.ussd_sessions FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE TRIGGER update_ussd_sessions_updated_at
BEFORE UPDATE ON public.ussd_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_ussd_sessions_created_at ON public.ussd_sessions (created_at DESC);
CREATE INDEX idx_ussd_sessions_origin ON public.ussd_sessions (origin);

CREATE TABLE public.ussd_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sessionid text NOT NULL,
  origin text,
  direction text NOT NULL,
  content text,
  ussdstate text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ussd_logs TO authenticated;
GRANT ALL ON public.ussd_logs TO service_role;

ALTER TABLE public.ussd_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage ussd logs"
ON public.ussd_logs FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE INDEX idx_ussd_logs_sessionid ON public.ussd_logs (sessionid);
CREATE INDEX idx_ussd_logs_created_at ON public.ussd_logs (created_at DESC);