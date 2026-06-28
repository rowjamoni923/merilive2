
-- Fix: enter_live_stream referenced nonexistent table public.follows; correct table is public.followers.
-- This broke "followers-only" privacy streams entirely (visitors got SQL error trying to join).
CREATE OR REPLACE FUNCTION public.enter_live_stream(p_stream_id uuid, p_password text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  uid uuid := auth.uid();
  ls RECORD;
  v_count int;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('success',false,'code','auth','reason','Sign in required.'); END IF;
  IF public.is_user_live_banned(uid) THEN
    RETURN jsonb_build_object('success',false,'code','banned','reason','You are live-banned.');
  END IF;

  SELECT id, host_id, live_privacy, live_password_hash, is_active, ended_at INTO ls
  FROM public.live_streams WHERE id = p_stream_id FOR SHARE;

  IF NOT FOUND OR COALESCE(ls.is_active,false) = false OR ls.ended_at IS NOT NULL THEN
    RETURN jsonb_build_object('success',false,'code','inactive','reason','Stream is not active.');
  END IF;

  IF ls.host_id <> uid THEN
    IF ls.live_privacy = 'password' THEN
      IF ls.live_password_hash IS NULL
         OR ls.live_password_hash <> extensions.crypt(coalesce(p_password,''), ls.live_password_hash) THEN
        RETURN jsonb_build_object('success',false,'code','password','reason','Wrong password.');
      END IF;
    ELSIF ls.live_privacy = 'followers' THEN
      IF NOT EXISTS (SELECT 1 FROM public.followers f WHERE f.follower_id = uid AND f.following_id = ls.host_id) THEN
        RETURN jsonb_build_object('success',false,'code','followers_only','reason','Follow the host to enter.');
      END IF;
    ELSIF ls.live_privacy = 'pk_only' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.pk_battles pk
        WHERE pk.status IN ('active','accepted','starting')
          AND ((pk.host1_id = ls.host_id AND pk.host2_id = uid)
            OR (pk.host2_id = ls.host_id AND pk.host1_id = uid))
      ) THEN
        RETURN jsonb_build_object('success',false,'code','pk_only','reason','PK-only room.');
      END IF;
    END IF;
  END IF;

  PERFORM set_config('app.bypass_live_stream_guard', 'on', true);
  INSERT INTO public.stream_viewers (stream_id, viewer_id, joined_at, left_at)
  VALUES (p_stream_id, uid, now(), NULL)
  ON CONFLICT (stream_id, viewer_id) DO UPDATE
    SET joined_at = CASE WHEN public.stream_viewers.left_at IS NULL
                         THEN public.stream_viewers.joined_at ELSE now() END,
        left_at = NULL,
        last_seen_at = now();
  PERFORM set_config('app.bypass_live_stream_guard', 'off', true);

  SELECT count(*)::int INTO v_count
  FROM public.stream_viewers WHERE stream_id = p_stream_id AND left_at IS NULL;

  PERFORM set_config('app.bypass_live_stream_guard', 'on', true);
  UPDATE public.live_streams SET viewer_count = v_count WHERE id = p_stream_id;
  PERFORM set_config('app.bypass_live_stream_guard', 'off', true);

  RETURN jsonb_build_object('success', true, 'viewer_count', v_count);
END;
$function$;
