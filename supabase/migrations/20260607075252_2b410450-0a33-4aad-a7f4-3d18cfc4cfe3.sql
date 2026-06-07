-- Fix trusted live-stream presence updates blocked by stream_viewers guard.
-- The guard still blocks normal client edits to server-managed fields, but allows
-- trusted SECURITY DEFINER RPCs/triggers/cron when they set app.bypass_live_stream_guard.

CREATE OR REPLACE FUNCTION public.guard_stream_viewers_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bypass text;
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN RETURN NEW; END IF;
  IF public.is_active_admin_session() THEN RETURN NEW; END IF;
  IF public.is_admin(auth.uid()) THEN RETURN NEW; END IF;

  BEGIN
    v_bypass := current_setting('app.bypass_live_stream_guard', true);
  EXCEPTION WHEN OTHERS THEN
    v_bypass := NULL;
  END;
  IF v_bypass = 'on' THEN RETURN NEW; END IF;

  IF NEW.stream_id IS DISTINCT FROM OLD.stream_id THEN
    RAISE EXCEPTION 'stream_viewers.stream_id is immutable';
  END IF;
  IF NEW.viewer_id IS DISTINCT FROM OLD.viewer_id THEN
    RAISE EXCEPTION 'stream_viewers.viewer_id is immutable';
  END IF;
  IF NEW.joined_at IS DISTINCT FROM OLD.joined_at THEN
    RAISE EXCEPTION 'stream_viewers.joined_at is immutable';
  END IF;
  IF NEW.left_at IS DISTINCT FROM OLD.left_at THEN
    RAISE EXCEPTION 'stream_viewers.left_at is server-managed';
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'stream_viewers.is_active is server-managed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enter_live_stream(p_stream_id uuid, p_password text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
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
      IF NOT EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = uid AND f.following_id = ls.host_id) THEN
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
$$;

CREATE OR REPLACE FUNCTION public.leave_live_stream_viewer(p_stream_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_viewer_id uuid := auth.uid();
  v_count integer := 0;
BEGIN
  IF v_viewer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  PERFORM set_config('app.bypass_live_stream_guard', 'on', true);
  UPDATE public.stream_viewers
     SET left_at = now()
   WHERE stream_id = p_stream_id
     AND viewer_id = v_viewer_id
     AND left_at IS NULL;
  PERFORM set_config('app.bypass_live_stream_guard', 'off', true);

  SELECT count(*)::integer
    INTO v_count
  FROM public.stream_viewers
  WHERE stream_id = p_stream_id
    AND left_at IS NULL;

  PERFORM set_config('app.bypass_live_stream_guard', 'on', true);
  UPDATE public.live_streams
     SET viewer_count = CASE WHEN ended_at IS NULL THEN v_count ELSE 0 END
   WHERE id = p_stream_id;
  PERFORM set_config('app.bypass_live_stream_guard', 'off', true);

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_live_stream(
  p_title text DEFAULT NULL,
  p_thumbnail_url text DEFAULT NULL,
  p_display_name text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_live_privacy text DEFAULT 'public',
  p_password text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  gate jsonb;
  v_title text;
  v_mod jsonb;
  v_priv text := lower(trim(coalesce(p_live_privacy, 'public')));
  v_pw_hash text;
  v_cat_ok boolean;
  v_ul int;
  new_row public.live_streams%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'auth', 'reason', 'Not authenticated.');
  END IF;

  IF v_priv NOT IN ('public', 'followers', 'password', 'pk_only') THEN
    RETURN jsonb_build_object('success', false, 'code', 'privacy', 'reason', 'Invalid privacy option.');
  END IF;

  IF v_priv = 'pk_only' THEN
    SELECT coalesce(user_level, 0) INTO v_ul FROM public.profiles WHERE id = uid;
    IF coalesce(v_ul, 0) < 10 THEN
      RETURN jsonb_build_object('success', false, 'code', 'level', 'reason', 'PK-only live requires user level 10 or higher.');
    END IF;
  END IF;

  IF v_priv = 'password' THEN
    IF p_password IS NULL OR length(trim(p_password)) < 4 THEN
      RETURN jsonb_build_object('success', false, 'code', 'password', 'reason', 'Password room requires a password of at least 4 characters.');
    END IF;
    v_pw_hash := crypt(trim(p_password), gen_salt('bf'));
  ELSE
    v_pw_hash := NULL;
  END IF;

  IF p_category_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.live_categories c
      WHERE c.id = p_category_id AND coalesce(c.is_active, true) = true
    ) INTO v_cat_ok;
    IF NOT coalesce(v_cat_ok, false) THEN
      RETURN jsonb_build_object('success', false, 'code', 'category', 'reason', 'Invalid or inactive category.');
    END IF;
  END IF;

  SELECT public.can_user_go_live() INTO gate;
  IF coalesce((gate->>'allowed')::boolean, false) IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('success', false, 'code', coalesce(gate->>'code', 'denied'), 'reason', coalesce(gate->>'reason', 'Not allowed to go live.'));
  END IF;

  PERFORM set_config('app.bypass_live_stream_guard', 'on', true);
  UPDATE public.live_streams
  SET is_active = false, ended_at = now(), viewer_count = 0, status = 'ended'
  WHERE host_id = uid AND coalesce(is_active, false) = true;
  PERFORM set_config('app.bypass_live_stream_guard', 'off', true);

  v_title := trim(coalesce(p_title, ''));
  IF v_title = '' THEN
    IF trim(coalesce(p_display_name, '')) <> '' THEN
      v_title := trim(p_display_name) || '''s Live';
    ELSE
      v_title := 'User''s Live';
    END IF;
  END IF;

  SELECT public.moderate_text(v_title, 'live_title') INTO v_mod;
  IF coalesce((v_mod->>'success')::boolean, false) IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('success', false, 'code', coalesce(v_mod->>'code', 'moderated'), 'reason', coalesce(v_mod->>'reason', 'Title not allowed.'));
  END IF;
  v_title := coalesce(v_mod->>'clean_text', v_title);

  INSERT INTO public.live_streams (
    host_id, title, thumbnail_url, is_active, status, started_at,
    viewer_count, total_coins_earned, last_heartbeat,
    category_id, live_privacy, live_password_hash
  )
  VALUES (
    uid, v_title, nullif(trim(coalesce(p_thumbnail_url, '')), ''),
    true, 'starting', now(), 0, 0, now(),
    p_category_id, v_priv, v_pw_hash
  )
  RETURNING * INTO new_row;

  RETURN jsonb_build_object(
    'success', true,
    'stream', jsonb_build_object(
      'id', new_row.id,
      'host_id', new_row.host_id,
      'title', new_row.title,
      'viewer_count', new_row.viewer_count,
      'is_active', new_row.is_active,
      'status', new_row.status,
      'thumbnail_url', new_row.thumbnail_url,
      'started_at', new_row.started_at,
      'category_id', new_row.category_id,
      'live_privacy', new_row.live_privacy
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_stale_live_streams()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  closed_count integer;
BEGIN
  -- Professional safety window: avoid closing real mobile/web host sessions on
  -- short heartbeat stalls while still cleaning abandoned sessions.
  PERFORM set_config('app.bypass_live_stream_guard', 'on', true);
  UPDATE public.live_streams
  SET is_active = false,
      ended_at = COALESCE(ended_at, now()),
      status = 'ended',
      viewer_count = 0
  WHERE COALESCE(is_active, false) = true
    AND COALESCE(last_heartbeat, started_at, created_at) < now() - interval '10 minutes';
  GET DIAGNOSTICS closed_count = ROW_COUNT;
  PERFORM set_config('app.bypass_live_stream_guard', 'off', true);

  RETURN closed_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_live_stream(p_stream_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_started timestamptz;
  v_is_active boolean;
  v_ended_existing timestamptz;
  v_ended timestamptz;
  v_duration int;
  v_audience int;
  v_total_coins bigint := 0;
  v_host_pct int;
  v_beans bigint := 0;
  v_total_diamonds bigint := 0;
  v_total_gifters int := 0;
  v_top jsonb := '[]'::jsonb;
  v_next jsonb;
  v_user_level int;
  v_max_level int;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT started_at, is_active, ended_at
  INTO v_started, v_is_active, v_ended_existing
  FROM public.live_streams
  WHERE id = p_stream_id AND host_id = uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stream not found or not your stream');
  END IF;

  v_ended := CASE WHEN v_is_active THEN now() ELSE coalesce(v_ended_existing, now()) END;

  IF v_is_active THEN
    PERFORM set_config('app.bypass_live_stream_guard', 'on', true);
    UPDATE public.live_streams
    SET is_active = false,
        ended_at = coalesce(ended_at, v_ended),
        status = 'ended',
        viewer_count = 0
    WHERE id = p_stream_id AND host_id = uid;
    PERFORM set_config('app.bypass_live_stream_guard', 'off', true);
  END IF;

  SELECT count(DISTINCT viewer_id)::int INTO v_audience
  FROM public.stream_viewers WHERE stream_id = p_stream_id;

  SELECT coalesce(sum(coin_amount), 0)::bigint INTO v_total_coins
  FROM public.gift_transactions
  WHERE stream_id = p_stream_id AND receiver_id = uid;

  SELECT coalesce(sum(diamond_cost), 0)::bigint INTO v_total_diamonds
  FROM public.gift_transactions
  WHERE stream_id = p_stream_id AND receiver_id = uid;

  SELECT count(DISTINCT sender_id)::int INTO v_total_gifters
  FROM public.gift_transactions
  WHERE stream_id = p_stream_id AND receiver_id = uid AND sender_id IS NOT NULL;

  SELECT coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'sender_id', s.sender_id,
          'total_coins', s.total_coins_spent,
          'display_name', s.display_name,
          'avatar_url', s.avatar_url
        )
        ORDER BY s.total_coins_spent DESC
      )
      FROM (
        SELECT
          gt.sender_id,
          sum(gt.coin_amount)::bigint AS total_coins_spent,
          max(pp.display_name) AS display_name,
          max(pp.avatar_url) AS avatar_url
        FROM public.gift_transactions gt
        LEFT JOIN public.profiles_public pp ON pp.id = gt.sender_id
        WHERE gt.stream_id = p_stream_id
          AND gt.receiver_id = uid
          AND gt.sender_id IS NOT NULL
        GROUP BY gt.sender_id
        ORDER BY sum(gt.coin_amount) DESC
        LIMIT 3
      ) s
    ),
    '[]'::jsonb
  ) INTO v_top;

  v_host_pct := public.get_effective_host_percent();
  v_beans := floor(v_total_coins * v_host_pct / 100.0)::bigint;

  v_duration := greatest(0, extract(epoch FROM (v_ended - coalesce(v_started, v_ended)))::int);

  SELECT p.user_level, p.max_user_level
  INTO v_user_level, v_max_level
  FROM public.profiles p WHERE p.id = uid;

  v_next := jsonb_build_object(
    'user_level', coalesce(v_user_level, 1),
    'max_user_level', coalesce(v_max_level, 99)
  );

  RETURN jsonb_build_object(
    'success', true,
    'stream_id', p_stream_id,
    'duration', v_duration,
    'total_beans', v_beans,
    'total_diamonds', v_total_diamonds,
    'total_gifters', v_total_gifters,
    'top_gifters', v_top,
    'next_level_progress', v_next,
    'duration_seconds', v_duration,
    'audience_count', coalesce(v_audience, 0),
    'total_gift_coins', v_total_coins,
    'estimated_host_beans', v_beans,
    'beans_earned', v_beans,
    'host_percent', v_host_pct
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enter_live_stream(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_live_stream_viewer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_live_stream_viewer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.start_live_stream(text, text, text, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_live_stream(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cleanup_stale_live_streams() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enter_live_stream(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_live_stream_viewer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leave_live_stream_viewer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_live_stream(text, text, text, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.end_live_stream(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_live_streams() TO authenticated, service_role;