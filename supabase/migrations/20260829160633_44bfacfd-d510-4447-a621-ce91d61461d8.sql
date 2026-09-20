-- ===== 1) Tolerant label normalization =====
ALTER TABLE public.ussd_price_catalog DROP COLUMN IF EXISTS normalized_label;

CREATE OR REPLACE FUNCTION public.ussd_normalize_label(p_label text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(coalesce(p_label,'')), '[^a-z0-9]+', ' ', 'g'),
          '\m(xadidneyn|xadidnaan|xaddidnayn|xadidneen|xadidnayn)\M', 'xadidnayn', 'g'),
        '\m(ku hadal|kuhadall|kuhadal|kuhdal)\M', 'kuhadal', 'g'),
      '\m(saacadood|saacado|saacad|saacc|saac|hours|hour|hrs|hr)\M', 'saac', 'g'),
    '\m(maalmood|maalmo|maalin|days|day)\M', 'maalin', 'g'))
$$;

ALTER TABLE public.ussd_price_catalog
  ADD COLUMN normalized_label text GENERATED ALWAYS AS (public.ussd_normalize_label(label)) STORED;

CREATE INDEX IF NOT EXISTS idx_ussd_price_catalog_norm
  ON public.ussd_price_catalog (root_package_id, normalized_label);

-- Mudada xirmada (tusaale '24 saac', '30 maalin') si loo isbarbardhigo
CREATE OR REPLACE FUNCTION public.ussd_duration_key(p_label text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
           WHEN m IS NULL THEN NULL
           ELSE m[1] || ' ' || m[2]
         END
  FROM (
    SELECT regexp_match(
             public.ussd_normalize_label(public.ussd_strip_price_prefix(p_label)),
             '([0-9]+) (saac|maalin)'
           ) AS m
  ) s
$$;

-- ===== 2) Labels aan catalog-ga ku jirin =====
CREATE TABLE IF NOT EXISTS public.discovery_unmatched_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  root_package_id uuid NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  raw_label text NOT NULL,
  normalized_label text NOT NULL,
  hits integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (root_package_id, normalized_label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discovery_unmatched_labels TO authenticated;
GRANT ALL ON public.discovery_unmatched_labels TO service_role;
ALTER TABLE public.discovery_unmatched_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage unmatched labels" ON public.discovery_unmatched_labels;
CREATE POLICY "Admins manage unmatched labels"
  ON public.discovery_unmatched_labels FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS trg_unmatched_labels_updated ON public.discovery_unmatched_labels;
CREATE TRIGGER trg_unmatched_labels_updated
  BEFORE UPDATE ON public.discovery_unmatched_labels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== 3) get_package_discovery: wax lama qarinayo =====
CREATE OR REPLACE FUNCTION public.get_package_discovery(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

  WITH rows AS (
    SELECT item->>'index' AS idx,
           public.ussd_strip_price_prefix(item->>'label') AS raw_label,
           m.label         AS c_label,
           m.selling_price AS c_price,
           m.info_line1    AS c_info1,
           m.info_line2    AS c_info2
    FROM jsonb_array_elements(v_row.items) AS item
    LEFT JOIN LATERAL (
      SELECT c.label, c.selling_price, c.info_line1, c.info_line2
      FROM public.ussd_price_catalog c
      WHERE c.root_package_id = v_row.root_package_id
        AND c.is_active = true
        AND (
          c.normalized_label = public.ussd_normalize_label(public.ussd_strip_price_prefix(item->>'label'))
          OR (
            public.ussd_duration_key(c.label) IS NOT NULL
            AND public.ussd_duration_key(c.label) = public.ussd_duration_key(item->>'label')
          )
        )
      ORDER BY (c.normalized_label = public.ussd_normalize_label(public.ussd_strip_price_prefix(item->>'label'))) DESC
      LIMIT 1
    ) m ON true
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'index', idx,
           'label', COALESCE(c_label, raw_label),
           'carrier_label', raw_label,
           'selling_price', c_price,
           'info_line1', c_info1,
           'info_line2', c_info2,
           'price_missing', (c_price IS NULL)
         ) ORDER BY idx), '[]'::jsonb)
  INTO v_packages
  FROM rows;

  -- Labels aan qiimo lahayn: admin ha arko
  INSERT INTO public.discovery_unmatched_labels (root_package_id, raw_label, normalized_label)
  SELECT v_row.root_package_id,
         public.ussd_strip_price_prefix(item->>'label'),
         public.ussd_normalize_label(public.ussd_strip_price_prefix(item->>'label'))
  FROM jsonb_array_elements(v_row.items) AS item
  WHERE NOT EXISTS (
    SELECT 1 FROM public.ussd_price_catalog c
    WHERE c.root_package_id = v_row.root_package_id
      AND c.is_active = true
      AND (
        c.normalized_label = public.ussd_normalize_label(public.ussd_strip_price_prefix(item->>'label'))
        OR (public.ussd_duration_key(c.label) IS NOT NULL
            AND public.ussd_duration_key(c.label) = public.ussd_duration_key(item->>'label'))
      )
  )
  ON CONFLICT (root_package_id, normalized_label)
  DO UPDATE SET hits = public.discovery_unmatched_labels.hits + 1,
                last_seen_at = now(),
                raw_label = EXCLUDED.raw_label;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'done',
    'packages', v_packages,
    'session_state', v_row.session_state,
    'session_seconds_left', GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(v_row.session_expires_at, now()) - now()))::int)
  );
END;
$function$;

-- ===== 4) Xoree session-ka marka user-ku ka baxo =====
CREATE OR REPLACE FUNCTION public.release_discovery_session(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.ussd_package_discoveries
     SET session_state = 'closed',
         session_expires_at = NULL,
         session_note = COALESCE(session_note, 'released_by_user')
   WHERE id = p_id
     AND session_state = 'open';
  RETURN jsonb_build_object('success', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.release_discovery_session(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.release_discovery_session(uuid) TO anon, authenticated, service_role;

-- ===== 5) Codsiga baarista: 90s ka hor timeout =====
CREATE OR REPLACE FUNCTION public.claim_next_discovery(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ussd_package_discoveries%ROWTYPE;
  v_root_name text;
BEGIN
  UPDATE public.ussd_package_discoveries
  SET status = 'pending', device_id = NULL
  WHERE status = 'processing'
    AND claimed_at < now() - interval '2 minutes';

  UPDATE public.ussd_package_discoveries
  SET status = 'failed', error = 'timeout', completed_at = now()
  WHERE status = 'pending'
    AND created_at < now() - interval '90 seconds';

  SELECT * INTO v_row
  FROM public.ussd_package_discoveries
  WHERE status = 'pending'
    AND created_at >= now() - interval '90 seconds'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.ussd_package_discoveries
  SET status = 'processing', device_id = p_device_id, claimed_at = now()
  WHERE id = v_row.id;

  SELECT package_name INTO v_root_name
  FROM public.data_packages_config
  WHERE id = v_row.root_package_id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'phone_number', v_row.phone_number,
    'menu1_label', COALESCE(v_root_name, ''),
    'ussd_code', '*212*' || v_row.phone_number || '#'
  );
END;
$$;

-- ===== 6) Codsi baaris oo sugaya: taleefanku ha ogaado =====
CREATE OR REPLACE FUNCTION public.discovery_has_waiting_request()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ussd_package_discoveries
    WHERE status = 'pending'
      AND created_at >= now() - interval '90 seconds'
  )
$$;

REVOKE ALL ON FUNCTION public.discovery_has_waiting_request() FROM public;
GRANT EXECUTE ON FUNCTION public.discovery_has_waiting_request() TO anon, authenticated, service_role;