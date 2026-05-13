-- Harden admin_gift_frame_to_user so the UPDATE branch (re-gifting an
-- already-assigned frame) ALSO unequips other admin frames + sets
-- profiles.equipped_frame_id, mirroring what the BEFORE INSERT trigger
-- does on first assignment. Without this, re-gifting silently kept the
-- previously equipped frame on the user's avatar — which the user
-- experienced as "frame is gifted but cannot be equipped".
CREATE OR REPLACE FUNCTION public.admin_gift_frame_to_user(
  p_user_id uuid,
  p_frame_id uuid,
  p_source_table text DEFAULT 'avatar_frames',
  p_expires_at timestamp with time zone DEFAULT NULL,
  p_notes text DEFAULT 'Gifted by admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_assignment_id uuid;
  v_frame_exists boolean;
  v_current_equipped uuid;
BEGIN
  IF NOT (public.is_active_admin_session() OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_source_table = 'avatar_frames' THEN
    SELECT EXISTS(SELECT 1 FROM public.avatar_frames WHERE id = p_frame_id AND is_active = true)
      INTO v_frame_exists;
  ELSIF p_source_table = 'role_frames' THEN
    SELECT EXISTS(SELECT 1 FROM public.role_frames WHERE id = p_frame_id AND is_active = true)
      INTO v_frame_exists;
  ELSE
    RAISE EXCEPTION 'Invalid source_table: %', p_source_table;
  END IF;

  IF NOT v_frame_exists THEN
    RAISE EXCEPTION 'Frame % not found or inactive in %', p_frame_id, p_source_table;
  END IF;

  -- Bypass profile protection trigger for the equipped_frame_id update below
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  SELECT id INTO v_assignment_id
  FROM public.user_role_frames
  WHERE user_id = p_user_id
    AND frame_id = p_frame_id
    AND source_table = p_source_table
  LIMIT 1;

  IF v_assignment_id IS NOT NULL THEN
    -- Re-gift path: trigger does NOT fire on UPDATE, so do the equip
    -- bookkeeping inline.
    UPDATE public.user_role_frames
       SET is_equipped = true,
           expires_at  = p_expires_at,
           notes       = p_notes,
           assigned_at = now()
     WHERE id = v_assignment_id;

    -- Unequip every OTHER admin-assigned frame for this user.
    UPDATE public.user_role_frames
       SET is_equipped = false
     WHERE user_id = p_user_id
       AND id <> v_assignment_id
       AND is_equipped = true;

    -- Snapshot previous frame and set the new one on profiles so the
    -- avatar updates everywhere (feed, chat, live, profile).
    SELECT equipped_frame_id INTO v_current_equipped
      FROM public.profiles WHERE id = p_user_id;

    UPDATE public.profiles
       SET previous_frame_id = CASE
             WHEN v_current_equipped IS NOT NULL
              AND v_current_equipped <> p_frame_id
             THEN v_current_equipped
             ELSE previous_frame_id
           END,
           equipped_frame_id = p_frame_id
     WHERE id = p_user_id;
  ELSE
    -- First-time assignment: BEFORE INSERT trigger handles the equip
    -- + profile update.
    INSERT INTO public.user_role_frames (user_id, frame_id, source_table, role_type, expires_at, notes)
    VALUES (p_user_id, p_frame_id, p_source_table, 'admin', p_expires_at, p_notes)
    RETURNING id INTO v_assignment_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'assignment_id', v_assignment_id,
    'user_id', p_user_id,
    'frame_id', p_frame_id,
    'source_table', p_source_table
  );
END;
$function$;