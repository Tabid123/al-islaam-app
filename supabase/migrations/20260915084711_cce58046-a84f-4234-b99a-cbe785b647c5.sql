CREATE TABLE public.provider_response_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL UNIQUE,
  message_so text NOT NULL DEFAULT '',
  message_en text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.provider_response_messages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_response_messages TO authenticated;
GRANT ALL ON public.provider_response_messages TO service_role;

ALTER TABLE public.provider_response_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active provider messages"
ON public.provider_response_messages FOR SELECT
USING (is_active = true OR public.is_admin());

CREATE POLICY "Admins manage provider messages"
ON public.provider_response_messages FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE TRIGGER update_provider_response_messages_updated_at
BEFORE UPDATE ON public.provider_response_messages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.provider_response_messages (provider_name, message_so, message_en, display_order) VALUES
  ('Hormuud', 'Qalad baa dhacay, fadlan isku day mar kale', 'An error occurred, please try again later', 1),
  ('Somnet', 'Qalad baa dhacay, fadlan isku day mar kale', 'An error occurred, please try again later', 2),
  ('Somtel', 'Qalad baa dhacay, fadlan isku day mar kale', 'An error occurred, please try again later', 3),
  ('Amtel', 'Qalad baa dhacay, fadlan isku day mar kale', 'An error occurred, please try again later', 4);