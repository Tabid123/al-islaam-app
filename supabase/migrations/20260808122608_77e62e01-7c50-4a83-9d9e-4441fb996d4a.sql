CREATE OR REPLACE FUNCTION public.admin_remove_admin(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_deleted int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RETURN json_build_object('success', false, 'message', 'Super admin kaliya ayaa saari kara admin');
  END IF;
  IF p_user_id = auth.uid() THEN
    RETURN json_build_object('success', false, 'message', 'Naftaada ma saari kartid');
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'super_admin') THEN
    RETURN json_build_object('success', false, 'message', 'Super admin lama saari karo');
  END IF;

  DELETE FROM public.admin_permissions WHERE user_id = p_user_id;
  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = 'admin';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN json_build_object('success', v_deleted > 0, 'message',
    CASE WHEN v_deleted > 0 THEN 'Admin waa la saaray' ELSE 'Admin lama helin' END);
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_admin_context()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'is_super_admin', public.has_role(auth.uid(), 'super_admin'),
    'is_admin', public.is_admin(),
    'permissions', COALESCE((SELECT jsonb_agg(permission_key) FROM public.admin_permissions WHERE user_id = auth.uid()), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_remove_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_admin(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_admin_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_admin_context() TO authenticated;