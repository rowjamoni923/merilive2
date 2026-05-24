-- Pkg323 Party Room pass-3: close server-side creation/join permission gaps

-- 1) Server-side creation eligibility must match admin feature-level rules.
CREATE OR REPLACE FUNCTION public.enforce_party_room_insert_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile record;
  v_is_host boolean := false;
  v_required_level int := 0;
  v_user_level int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT
    COALESCE(is_banned, false) AS is_banned,
    COALESCE(is_blocked, false) AS is_blocked,
    COALESCE(is_host, false) AS is_host,
    COALESCE(host_status, '') AS host_status,
    COALESCE(gender, '') AS gender,
    COALESCE(user_level, 0) AS user_level,
    COALESCE(host_level, 0) AS host_level,
    COALESCE(max_user_level, 0) AS max_user_level
  INTO v_profile
  FROM public.profiles
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  IF v_profile.is_banned OR v_profile.is_blocked THEN
    RAISE EXCEPTION 'Banned users cannot create party rooms';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.live_bans
    WHERE user_id = v_uid
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  ) THEN
    RAISE EXCEPTION 'You are temporarily banned from creating rooms';
  END IF;

  v_is_host := v_profile.is_host
    OR lower(v_profile.host_status) = 'approved'
    OR lower(v_profile.gender) = 'female';

  v_user_level := GREATEST(
    v_profile.user_level,
    v_profile.host_level,
    v_profile.max_user_level
  );

  SELECT COALESCE(
    CASE WHEN v_is_host THEN min_level_host ELSE min_level_user END,
    0
  )
  INTO v_required_level
  FROM public.feature_level_requirements
  WHERE feature_key = 'create_party'
    AND COALESCE(is_active, true) = true
  LIMIT 1;

  v_required_level := COALESCE(v_required_level, 0);
  IF v_user_level < v_required_level THEN
    RAISE EXCEPTION 'Level % required to create party rooms', v_required_level;
  END IF;

  -- Force identity and safe lifecycle values server-side.
  NEW.host_id := v_uid;
  NEW.name := left(nullif(trim(coalesce(NEW.name, '')), ''), 80);
  IF NEW.name IS NULL THEN NEW.name := 'Party Room'; END IF;

  NEW.room_type := lower(trim(coalesce(NEW.room_type, 'audio')));
  IF NEW.room_type NOT IN ('audio','video','game') THEN
    NEW.room_type := 'audio';
  END IF;

  NEW.max_participants := GREATEST(2, LEAST(COALESCE(NEW.max_participants, NEW.total_seats, 8), 20));
  NEW.total_seats := GREATEST(2, LEAST(COALESCE(NEW.total_seats, NEW.max_participants, 8), 20));
  NEW.is_active := true;
  NEW.ended_at := NULL;
  NEW.is_locked := COALESCE(NEW.is_locked, NEW.password_hash IS NOT NULL, false);
  NEW.entry_fee := GREATEST(COALESCE(NEW.entry_fee, 0), 0);
  NEW.min_level := GREATEST(COALESCE(NEW.min_level, 0), 0);
  IF NEW.created_at IS NULL THEN NEW.created_at := now(); END IF;
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_enforce_party_room_insert ON public.party_rooms;
CREATE TRIGGER tg_enforce_party_room_insert
  BEFORE INSERT ON public.party_rooms
  FOR EACH ROW EXECUTE FUNCTION public.enforce_party_room_insert_eligibility();

-- 2) Only authenticated callers may use room-entry and access helper RPCs.
REVOKE EXECUTE ON FUNCTION public.enter_party_room(uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.enter_party_room(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_access_party_room(p_user_id uuid, p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT (
    auth.uid() = p_user_id
    OR current_setting('request.jwt.claim.role', true) = 'service_role'
    OR public.is_active_admin_session()
  )
  AND EXISTS (
    SELECT 1 FROM public.party_rooms r
    WHERE r.id = p_room_id AND COALESCE(r.is_active, true) = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND (COALESCE(p.is_blocked, false) = true OR COALESCE(p.is_banned, false) = true)
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.live_bans lb
    WHERE lb.user_id = p_user_id AND lb.is_active = true
      AND (lb.expires_at IS NULL OR lb.expires_at > now())
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.can_access_party_room(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_party_room(uuid, uuid) TO authenticated;

-- 3) Cleanup functions are maintenance-only; anonymous users must not be able to close stale rooms.
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_party_participants() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_party_rooms() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_party_participants() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_party_rooms() TO service_role;

-- 4) Trigger/helper functions should not be directly callable from clients.
REVOKE EXECUTE ON FUNCTION public.enforce_party_room_insert_eligibility() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_party_room_fields() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_party_participant_self_update() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_party_room_messages_update() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.party_room_cleanup_on_end() FROM anon, authenticated, PUBLIC;