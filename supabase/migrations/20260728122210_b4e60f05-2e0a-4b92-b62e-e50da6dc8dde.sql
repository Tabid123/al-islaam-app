
ALTER TABLE public.data_packages_config
  ADD COLUMN IF NOT EXISTS somlink_bundle_id integer;

ALTER TABLE public.delivery_queue
  ADD COLUMN IF NOT EXISTS somlink_response jsonb;
