ALTER TABLE public.pending_online_payments
  ADD COLUMN IF NOT EXISTS discovery_menu_label text,
  ADD COLUMN IF NOT EXISTS discovery_menu_index text;