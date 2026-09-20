-- 1) Discovery root flag on packages
ALTER TABLE public.data_packages_config
  ADD COLUMN IF NOT EXISTS is_discovery_root boolean NOT NULL DEFAULT false;

-- 2) Label normalizer
CREATE OR REPLACE FUNCTION public.ussd_normalize_label(p_label text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(
           regexp_replace(lower(coalesce(p_label,'')), '[^a-z0-9]+', ' ', 'g'),
           '\s+', ' ', 'g')
$$;

-- 3) Admin-managed price catalog
CREATE TABLE IF NOT EXISTS public.ussd_price_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  root_package_id uuid NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  label text NOT NULL,
  normalized_label text GENERATED ALWAYS AS (public.ussd_normalize_label(label)) STORED,
  cost_price numeric NOT NULL DEFAULT 0,
  selling_price numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ussd_price_catalog_root_label_uniq
  ON public.ussd_price_catalog (root_package_id, normalized_label);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ussd_price_catalog TO authenticated;
GRANT ALL ON public.ussd_price_catalog TO service_role;

ALTER TABLE public.ussd_price_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage ussd price catalog" ON public.ussd_price_catalog;
CREATE POLICY "Admins manage ussd price catalog"
  ON public.ussd_price_catalog FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS trg_ussd_price_catalog_updated ON public.ussd_price_catalog;
CREATE TRIGGER trg_ussd_price_catalog_updated
  BEFORE UPDATE ON public.ussd_price_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Discovery requests
CREATE TABLE IF NOT EXISTS public.ussd_package_discoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  root_package_id uuid NOT NULL REFERENCES public.data_packages_config(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  device_id text,
  raw_menu text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  expires_at timestamptz,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ussd_discoveries_pending_idx
  ON public.ussd_package_discoveries (status, created_at);
CREATE INDEX IF NOT EXISTS ussd_discoveries_cache_idx
  ON public.ussd_package_discoveries (root_package_id, phone_number, status, expires_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ussd_package_discoveries TO authenticated;
GRANT ALL ON public.ussd_package_discoveries TO service_role;

ALTER TABLE public.ussd_package_discoveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage ussd discoveries" ON public.ussd_package_discoveries;
CREATE POLICY "Admins manage ussd discoveries"
  ON public.ussd_package_discoveries FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS trg_ussd_discoveries_updated ON public.ussd_package_discoveries;
CREATE TRIGGER trg_ussd_discoveries_updated
  BEFORE UPDATE ON public.ussd_package_discoveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) Order columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discovery_menu_label text,
  ADD COLUMN IF NOT EXISTS discovery_root_id uuid;

-- 6) Request discovery (public, cached)
CREATE OR REPLACE FUNCTION public.request_package_discovery(p_root_package_id uuid, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_row public.ussd_package_discoveries%ROWTYPE;
  v_id uuid;
BEGIN
  v_phone := regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  IF length(v_phone) = 12 AND left(v_phone,3) = '252' THEN v_phone := substring(v_phone from 4); END IF;
  IF length(v_phone) = 10 AND left(v_phone,1) = '0'  THEN v_phone := substring(v_phone from 2); END IF;
  IF length(v_phone) < 9 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Lambar sax ah geli');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.data_packages_config
                 WHERE id = p_root_package_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Xulasho lama helin');
  END IF;

  -- cache hit
  SELECT * INTO v_row FROM public.ussd_package_discoveries
  WHERE root_package_id = p_root_package_id
    AND phone_number = v_phone
    AND status = 'done'
    AND expires_at > now()
  ORDER BY completed_at DESC LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'id', v_row.id, 'status', 'done', 'cached', true);
  END IF;

  -- reuse in-flight request
  SELECT * INTO v_row FROM public.ussd_package_discoveries
  WHERE root_package_id = p_root_package_id
    AND phone_number = v_phone
    AND status IN ('pending','processing')
    AND created_at > now() - interval '2 minutes'
  ORDER BY created_at DESC LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'id', v_row.id, 'status', v_row.status, 'cached', false);
  END IF;

  INSERT INTO public.ussd_package_discoveries(root_package_id, phone_number)
  VALUES (p_root_package_id, v_phone)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'status', 'pending', 'cached', false);
END;
$$;

-- 7) Poll discovery: only priced labels, never expose cost
CREATE OR REPLACE FUNCTION public.get_package_discovery(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'index', item->>'index',
           'label', item->>'label',
           'selling_price', c.selling_price
         ) ORDER BY c.selling_price), '[]'::jsonb)
  INTO v_packages
  FROM jsonb_array_elements(v_row.items) AS item
  JOIN public.ussd_price_catalog c
    ON c.root_package_id = v_row.root_package_id
   AND c.is_active = true
   AND c.normalized_label = public.ussd_normalize_label(item->>'label');

  RETURN jsonb_build_object('success', true, 'status', 'done', 'packages', v_packages);
END;
$$;

-- 8) Android: claim a discovery job
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
  WHERE status = 'processing' AND claimed_at < now() - interval '2 minutes';

  UPDATE public.ussd_package_discoveries
  SET status = 'failed', error = 'timeout', completed_at = now()
  WHERE status = 'pending' AND created_at < now() - interval '5 minutes';

  SELECT * INTO v_row FROM public.ussd_package_discoveries
  WHERE status = 'pending'
  ORDER BY created_at ASC
  LIMIT 1 FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.ussd_package_discoveries
  SET status = 'processing', device_id = p_device_id, claimed_at = now()
  WHERE id = v_row.id;

  SELECT package_name INTO v_root_name
  FROM public.data_packages_config WHERE id = v_row.root_package_id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'phone_number', v_row.phone_number,
    'menu1_label', COALESCE(v_root_name, ''),
    'ussd_code', '*212*' || v_row.phone_number || '#'
  );
END;
$$;

-- 9) Android: complete a discovery job
CREATE OR REPLACE FUNCTION public.complete_discovery(p_id uuid, p_raw_menu text, p_items jsonb DEFAULT '[]'::jsonb, p_error text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ussd_package_discoveries
  SET raw_menu = p_raw_menu,
      items = COALESCE(p_items, '[]'::jsonb),
      error = p_error,
      status = CASE WHEN p_error IS NULL THEN 'done' ELSE 'failed' END,
      completed_at = now(),
      expires_at = CASE WHEN p_error IS NULL THEN now() + interval '30 minutes' ELSE NULL END
  WHERE id = p_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 10) Grants on the new functions
REVOKE ALL ON FUNCTION public.request_package_discovery(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_package_discovery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_next_discovery(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_discovery(uuid, text, jsonb, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.request_package_discovery(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_package_discovery(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_discovery(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_discovery(uuid, text, jsonb, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ussd_normalize_label(text) TO anon, authenticated, service_role;