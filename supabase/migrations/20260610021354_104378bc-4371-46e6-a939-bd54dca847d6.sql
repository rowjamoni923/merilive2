CREATE OR REPLACE FUNCTION public.mark_livekit_participant_left(_room_name text, _identity text)
RETURNS TABLE(kind text, marked_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id text;
  v_uid uuid;
BEGIN
  IF _room_name IS NULL OR _identity IS NULL THEN RETURN; END IF;

  -- Identity may be either a raw UUID or 'user_<uuid>' prefixed form. Be lenient.
  BEGIN
    v_uid := (regexp_replace(_identity, '^user[_-]', ''))::uuid;
  EXCEPTION WHEN others THEN
    v_uid := NULL;
  END;
  IF v_uid IS NULL THEN RETURN; END IF;

  IF _room_name LIKE 'live_%' THEN
    v_id := substring(_room_name FROM 6);
    BEGIN
      UPDATE public.stream_viewers
         SET left_at = COALESCE(left_at, now()),
             is_active = false
       WHERE stream_id::text = v_id
         AND viewer_id = v_uid
         AND left_at IS NULL;
      IF FOUND THEN
        kind := 'stream_viewer'; marked_id := v_id; RETURN NEXT;
      END IF;
    EXCEPTION WHEN others THEN NULL;
    END;

  ELSIF _room_name LIKE 'party_%' THEN
    v_id := substring(_room_name FROM 7);
    BEGIN
      UPDATE public.party_room_participants
         SET left_at = COALESCE(left_at, now())
       WHERE room_id::text = v_id
         AND user_id = v_uid
         AND left_at IS NULL;
      IF FOUND THEN
        kind := 'party_participant'; marked_id := v_id; RETURN NEXT;
      END IF;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;

  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_livekit_participant_left(text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_livekit_participant_left(text, text) TO service_role;