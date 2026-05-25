-- Pkg340 pass-2: make sub-admin permission saves atomic and hide password hashes from client-side admin reads.

-- Remove duplicate permission rows before adding the natural uniqueness guard.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY admin_user_id, section_id
      ORDER BY granted_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.admin_section_permissions
)
DELETE FROM public.admin_section_permissions p
USING ranked r
WHERE p.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS admin_section_permissions_admin_section_uidx
  ON public.admin_section_permissions(admin_user_id, section_id);

CREATE OR REPLACE FUNCTION public.admin_set_section_permissions(
  p_admin_user_id uuid,
  p_permissions jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner_admin_id uuid;
  v_granted_by uuid;
  v_target_role public.admin_role;
  v_count integer := 0;
BEGIN
  v_owner_admin_id := public.current_admin_id_from_header();
  IF v_owner_admin_id IS NULL THEN
    RAISE EXCEPTION 'Admin session required' USING ERRCODE = '42501';
  END IF;

  SELECT user_id INTO v_granted_by
  FROM public.admin_users
  WHERE id = v_owner_admin_id
    AND role = 'owner'::public.admin_role
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner access required' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_target_role
  FROM public.admin_users
  WHERE id = p_admin_user_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Admin not found' USING ERRCODE = '22023';
  END IF;
  IF v_target_role = 'owner'::public.admin_role THEN
    RAISE EXCEPTION 'Owner permissions cannot be edited' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(COALESCE(p_permissions, '[]'::jsonb)) <> 'array'
     OR jsonb_array_length(COALESCE(p_permissions, '[]'::jsonb)) > 200 THEN
    RAISE EXCEPTION 'Invalid permissions payload' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.admin_section_permissions
  WHERE admin_user_id = p_admin_user_id;

  WITH requested AS (
    SELECT DISTINCT ON ((item->>'section_id')::uuid)
      (item->>'section_id')::uuid AS section_id,
      COALESCE((item->>'can_view')::boolean, true) AS can_view,
      COALESCE((item->>'can_edit')::boolean, false) AS can_edit,
      COALESCE((item->>'can_delete')::boolean, false) AS can_delete
    FROM jsonb_array_elements(COALESCE(p_permissions, '[]'::jsonb)) AS item
    WHERE jsonb_typeof(item) = 'object'
      AND (item->>'section_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ORDER BY (item->>'section_id')::uuid
  ), valid AS (
    SELECT r.*
    FROM requested r
    JOIN public.admin_sections s ON s.id = r.section_id
    WHERE s.is_active = true
      AND r.can_view = true
  ), inserted AS (
    INSERT INTO public.admin_section_permissions (
      admin_user_id,
      section_id,
      can_view,
      can_edit,
      can_delete,
      granted_by
    )
    SELECT
      p_admin_user_id,
      section_id,
      true,
      can_edit,
      can_delete,
      v_granted_by
    FROM valid
    ON CONFLICT (admin_user_id, section_id) DO UPDATE SET
      can_view = EXCLUDED.can_view,
      can_edit = EXCLUDED.can_edit,
      can_delete = EXCLUDED.can_delete,
      granted_by = EXCLUDED.granted_by,
      granted_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;

  RETURN jsonb_build_object('success', true, 'updated_count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_section_permissions(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_section_permissions(uuid, jsonb) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.admin_set_section_permissions(uuid, jsonb) IS
'Pkg340 pass-2: transactional owner-only replacement for client delete-then-insert on admin_section_permissions.';

-- Do not allow browser clients to read admin password hashes through SELECT *.
REVOKE SELECT ON public.admin_users FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id,
  user_id,
  email,
  display_name,
  role,
  is_active,
  invited_at,
  accepted_at,
  last_login_at,
  created_at,
  updated_at,
  invited_by,
  is_decoupled,
  must_change_password,
  password_reset_at,
  password_reset_by,
  password_set_at,
  support_display_name,
  whatsapp_number
) ON public.admin_users TO anon, authenticated;
GRANT ALL ON public.admin_users TO service_role;