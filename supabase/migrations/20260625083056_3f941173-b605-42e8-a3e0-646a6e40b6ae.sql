-- Owner/admin can add any (non-blocked) user to their group; user can self-join from public profile
CREATE OR REPLACE FUNCTION public.add_group_member(p_group_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_group  public.groups%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  SELECT * INTO v_group FROM public.groups WHERE id = p_group_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'group_not_found');
  END IF;
  IF COALESCE(v_group.is_active, true) = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'group_inactive');
  END IF;

  -- Permission: caller must be owner/admin of the group OR adding themselves
  IF p_user_id <> v_caller THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.group_members
      WHERE group_id = p_group_id
        AND user_id = v_caller
        AND role IN ('owner','admin')
    ) AND COALESCE(v_group.created_by, v_group.owner_id) <> v_caller THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
    END IF;
  END IF;

  -- Block bans
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND (COALESCE(is_banned,false) OR COALESCE(is_deleted,false))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_unavailable');
  END IF;

  -- Already a member?
  IF EXISTS (SELECT 1 FROM public.group_members WHERE group_id = p_group_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('ok', true, 'already_member', true);
  END IF;

  -- Family limit: 1 per user
  IF v_group.group_type = 'family' AND EXISTS (
    SELECT 1 FROM public.group_members gm
    JOIN public.groups g ON g.id = gm.group_id
    WHERE gm.user_id = p_user_id AND g.group_type = 'family'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'family_limit_reached');
  END IF;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES (p_group_id, p_user_id, 'member');

  UPDATE public.groups
  SET member_count = COALESCE(member_count, 0) + 1
  WHERE id = p_group_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_group_member(uuid, uuid) TO authenticated;