-- Add source_table to differentiate between role_frames and avatar_frames assignments
ALTER TABLE public.user_role_frames
  ADD COLUMN IF NOT EXISTS source_table text NOT NULL DEFAULT 'role_frames';

-- Update the auto-equip trigger to support both source tables
CREATE OR REPLACE FUNCTION public.auto_equip_role_frame()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_frame_active boolean;
  v_current_equipped uuid;
BEGIN
  -- Bypass profile protection trigger
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- Verify frame exists & is active in the correct source table
  IF COALESCE(NEW.source_table, 'role_frames') = 'avatar_frames' THEN
    SELECT is_active INTO v_frame_active
    FROM public.avatar_frames
    WHERE id = NEW.frame_id;
  ELSE
    SELECT is_active INTO v_frame_active
    FROM public.role_frames
    WHERE id = NEW.frame_id;
  END IF;

  IF v_frame_active IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;

  -- Mark this assignment as equipped
  NEW.is_equipped := TRUE;
  IF NEW.assigned_at IS NULL THEN
    NEW.assigned_at := now();
  END IF;

  -- Unequip any OTHER assignment the user previously had
  UPDATE public.user_role_frames
     SET is_equipped = FALSE
   WHERE user_id = NEW.user_id
     AND id <> COALESCE(NEW.id, gen_random_uuid())
     AND is_equipped = TRUE;

  -- Snapshot previous equipped frame so it can be restored later
  SELECT equipped_frame_id INTO v_current_equipped
  FROM public.profiles
  WHERE id = NEW.user_id;

  UPDATE public.profiles
     SET previous_frame_id = CASE
           WHEN v_current_equipped IS NOT NULL
            AND v_current_equipped <> NEW.frame_id
           THEN v_current_equipped
           ELSE previous_frame_id
         END,
         equipped_frame_id = NEW.frame_id
   WHERE id = NEW.user_id;

  RETURN NEW;
END;
$function$;

-- Admin RPC to gift any frame (avatar_frames or role_frames) to a user
CREATE OR REPLACE FUNCTION public.admin_gift_frame_to_user(
  p_user_id uuid,
  p_frame_id uuid,
  p_source_table text DEFAULT 'avatar_frames',
  p_expires_at timestamptz DEFAULT NULL,
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
BEGIN
  -- Allow either real admin auth or admin session token (admin panel)
  IF NOT public.is_admin(auth.uid())
     AND current_setting('request.headers', true)::jsonb->>'x-admin-token' IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Validate frame exists in the specified source table
  IF p_source_table = 'avatar_frames' THEN
    SELECT EXISTS(SELECT 1 FROM public.avatar_frames WHERE id = p_frame_id AND is_active = TRUE)
      INTO v_frame_exists;
  ELSIF p_source_table = 'role_frames' THEN
    SELECT EXISTS(SELECT 1 FROM public.role_frames WHERE id = p_frame_id AND is_active = TRUE)
      INTO v_frame_exists;
  ELSE
    RAISE EXCEPTION 'Invalid source_table: %', p_source_table;
  END IF;

  IF NOT v_frame_exists THEN
    RAISE EXCEPTION 'Frame % not found or inactive in %', p_frame_id, p_source_table;
  END IF;

  -- Prevent duplicate assignment of same frame to same user
  SELECT id INTO v_assignment_id
  FROM public.user_role_frames
  WHERE user_id = p_user_id
    AND frame_id = p_frame_id
    AND source_table = p_source_table
  LIMIT 1;

  IF v_assignment_id IS NOT NULL THEN
    -- Re-equip the existing one
    UPDATE public.user_role_frames
       SET is_equipped = TRUE,
           expires_at = p_expires_at,
           notes = p_notes,
           assigned_at = now()
     WHERE id = v_assignment_id;
  ELSE
    INSERT INTO public.user_role_frames (
      user_id, frame_id, source_table, role_type, expires_at, notes
    )
    VALUES (
      p_user_id, p_frame_id, p_source_table, 'admin', p_expires_at, p_notes
    )
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

GRANT EXECUTE ON FUNCTION public.admin_gift_frame_to_user(uuid, uuid, text, timestamptz, text) TO authenticated, anon;