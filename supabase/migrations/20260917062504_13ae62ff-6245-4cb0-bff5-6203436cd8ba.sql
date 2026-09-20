UPDATE public.android_devices
SET archived_at = NULL, is_active = true, updated_at = now()
WHERE archived_at IS NOT NULL;