ALTER TABLE public.ussd_price_catalog
  ADD COLUMN IF NOT EXISTS info_line1 text,
  ADD COLUMN IF NOT EXISTS info_line2 text;

CREATE OR REPLACE FUNCTION public.get_package_discovery(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.ussd_package_discoveries%ROWTYPE;
  v_packages jsonb;
BEGIN
  SELECT * INTO v_row FROM public.ussd_package_discoveries WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Codsi lama helin');
  END IF;

  IF v_row.status <> 'done' THEN
    RETURN jsonb_build_object('success', true, 'status', v_row.status, 'error', v_row.error, 'packages', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
           'index', item->>'index',
           'label', c.label,
           'selling_price', c.selling_price,
           'info_line1', c.info_line1,
           'info_line2', c.info_line2
         )), '[]'::jsonb)
  INTO v_packages
  FROM jsonb_array_elements(v_row.items) AS item
  JOIN public.ussd_price_catalog c
    ON c.root_package_id = v_row.root_package_id
   AND c.is_active = true
   AND c.normalized_label = public.ussd_normalize_label(
         public.ussd_strip_price_prefix(item->>'label'));

  RETURN jsonb_build_object('success', true, 'status', 'done', 'packages', v_packages);
END;
$function$;