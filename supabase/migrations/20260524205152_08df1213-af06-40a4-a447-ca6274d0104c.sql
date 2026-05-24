
-- 1. Drop dangerous legacy RPC + plaintext column
DROP FUNCTION IF EXISTS public.verify_party_room_password(uuid, text);
ALTER TABLE public.party_rooms DROP COLUMN IF EXISTS password;

-- 2. Rewrite create_party_room to bcrypt-hash into password_hash
CREATE OR REPLACE FUNCTION public.create_party_room(
  p_name text,
  p_room_type text,
  p_game_mode text DEFAULT NULL,
  p_password text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_limits jsonb;
  v_total int;
  v_max int;
  v_trim_name text;
  v_pass text;
  v_hash text;
  v_locked boolean;
  v_type text;
  new_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_trim_name := trim(coalesce(p_name, ''));
  IF v_trim_name = '' THEN v_trim_name := 'Party Room'; END IF;
  IF length(v_trim_name) > 80 THEN v_trim_name := left(v_trim_name, 80); END IF;

  v_type := lower(trim(coalesce(p_room_type, 'audio')));
  IF v_type NOT IN ('audio','video','game') THEN v_type := 'audio'; END IF;

  SELECT setting_value INTO v_limits FROM public.app_settings
   WHERE setting_key = 'party_room_limits' LIMIT 1;

  IF v_type = 'audio' THEN
    v_total := coalesce((v_limits ->> 'max_audio_participants')::int, 10);
  ELSIF v_type = 'game' THEN
    v_total := coalesce((v_limits ->> 'max_game_participants')::int, 8);
  ELSE
    v_total := coalesce((v_limits ->> 'max_video_participants')::int, 4);
  END IF;
  v_total := greatest(2, least(v_total, 20));
  v_max := v_total;

  v_pass := nullif(trim(coalesce(p_password, '')), '');
  IF v_pass IS NOT NULL AND length(v_pass) > 64 THEN
    RAISE EXCEPTION 'Password too long';
  END IF;
  v_locked := v_pass IS NOT NULL;
  v_hash := CASE WHEN v_pass IS NOT NULL
                 THEN extensions.crypt(v_pass, extensions.gen_salt('bf', 10))
                 ELSE NULL END;

  -- Auto-close previous active room for this host
  UPDATE public.party_room_participants p
     SET left_at = coalesce(p.left_at, now())
   WHERE p.left_at IS NULL
     AND p.room_id IN (
       SELECT pr.id FROM public.party_rooms pr
        WHERE pr.host_id = v_uid AND coalesce(pr.is_active, true) = true
     );
  UPDATE public.party_rooms pr
     SET is_active = false, ended_at = coalesce(pr.ended_at, now())
   WHERE pr.host_id = v_uid AND coalesce(pr.is_active, true) = true;

  INSERT INTO public.party_rooms (
    host_id, name, room_type, game_mode,
    password_hash, is_locked, total_seats, max_participants, is_active
  )
  VALUES (
    v_uid, v_trim_name, v_type,
    nullif(trim(coalesce(p_game_mode, '')), ''),
    v_hash, v_locked, v_total, v_max, true
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_party_room(text, text, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_party_room(text, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.end_party_room(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.end_party_room(uuid) TO authenticated;

-- 3. can_access_party_room: also reject live-banned users
CREATE OR REPLACE FUNCTION public.can_access_party_room(p_user_id uuid, p_room_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.party_rooms r
    WHERE r.id = p_room_id AND COALESCE(r.is_active, true) = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id AND COALESCE(p.is_blocked, false) = true
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.live_bans lb
    WHERE lb.user_id = p_user_id AND lb.is_active = true
      AND (lb.expires_at IS NULL OR lb.expires_at > now())
  );
$function$;

-- 4. Guard party_room_messages UPDATE — only is_deleted may change
CREATE OR REPLACE FUNCTION public.guard_party_room_messages_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN RETURN NEW; END IF;
  IF public.is_active_admin_session() THEN RETURN NEW; END IF;

  IF NEW.id        IS DISTINCT FROM OLD.id        THEN RAISE EXCEPTION 'id immutable'; END IF;
  IF NEW.room_id   IS DISTINCT FROM OLD.room_id   THEN RAISE EXCEPTION 'room_id immutable'; END IF;
  IF NEW.user_id   IS DISTINCT FROM OLD.user_id   THEN RAISE EXCEPTION 'user_id immutable'; END IF;
  IF NEW.message   IS DISTINCT FROM OLD.message   THEN RAISE EXCEPTION 'message is immutable; soft-delete only'; END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'created_at immutable'; END IF;
  -- Allow user to flip is_deleted true (soft-delete). Don't allow un-delete.
  IF OLD.is_deleted = true AND NEW.is_deleted = false THEN
    RAISE EXCEPTION 'cannot undelete a message';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_party_room_messages_update_trg ON public.party_room_messages;
CREATE TRIGGER guard_party_room_messages_update_trg
BEFORE UPDATE ON public.party_room_messages
FOR EACH ROW EXECUTE FUNCTION public.guard_party_room_messages_update();
