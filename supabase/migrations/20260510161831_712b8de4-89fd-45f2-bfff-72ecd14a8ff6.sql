CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.moderate_text(
  p_text text,
  p_context text DEFAULT 'general'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text := trim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g'));
  blocked text[] := ARRAY[
    'porn', 'porno', 'xxx', 'nazi', 'hitler', 'isis', 'rape', 'raping',
    'child porn', 'cp ', ' scam', 'scammer', 'whatsapp', 'telegram.me',
    't.me/'
  ];
  w text;
BEGIN
  IF length(t) > 60 THEN
    RETURN jsonb_build_object('success', false, 'code', 'length', 'reason', 'Text must be 60 characters or fewer.');
  END IF;

  IF p_context = 'live_title' AND length(t) = 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'empty', 'reason', 'Title cannot be empty for this check (use server default title instead).');
  END IF;

  FOREACH w IN ARRAY blocked LOOP
    IF position(lower(w) in lower(t)) > 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'profanity', 'reason', 'This text is not allowed.');
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'clean_text', t);
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_text(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderate_text(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.moderate_text(text, text) TO authenticated;

COMMENT ON FUNCTION public.moderate_text(text, text) IS '§3 title/chat gate: max 60 chars + basic blocked substring list; returns clean_text.';

CREATE TABLE IF NOT EXISTS public.live_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "live_categories_select_active" ON public.live_categories;
CREATE POLICY "live_categories_select_active"
  ON public.live_categories
  FOR SELECT TO authenticated
  USING (coalesce(is_active, true) = true);

DROP POLICY IF EXISTS "live_categories_admin_all" ON public.live_categories;
CREATE POLICY "live_categories_admin_all"
  ON public.live_categories
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.live_categories (slug, label, sort_order, is_active)
VALUES
  ('chat', 'Chat & Chill', 10, true),
  ('music', 'Music', 20, true),
  ('dance', 'Dance', 30, true),
  ('pk', 'PK / Battle', 40, true),
  ('new_host', 'New Host', 50, true)
ON CONFLICT (slug) DO NOTHING;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_categories;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.live_categories (id),
  ADD COLUMN IF NOT EXISTS live_privacy text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS live_password_hash text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'live_streams_live_privacy_check'
  ) THEN
    ALTER TABLE public.live_streams
      ADD CONSTRAINT live_streams_live_privacy_check
      CHECK (live_privacy IN ('public', 'followers', 'password', 'pk_only'));
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('host-covers', 'host-covers', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp']::text[])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "host_covers_public_read" ON storage.objects;
CREATE POLICY "host_covers_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'host-covers');

DROP POLICY IF EXISTS "host_covers_owner_insert" ON storage.objects;
CREATE POLICY "host_covers_owner_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'host-covers' AND split_part(name, '/', 1) = auth.uid()::text);

DROP POLICY IF EXISTS "host_covers_owner_update" ON storage.objects;
CREATE POLICY "host_covers_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'host-covers' AND split_part(name, '/', 1) = auth.uid()::text)
  WITH CHECK (bucket_id = 'host-covers' AND split_part(name, '/', 1) = auth.uid()::text);

DROP POLICY IF EXISTS "host_covers_owner_delete" ON storage.objects;
CREATE POLICY "host_covers_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'host-covers' AND split_part(name, '/', 1) = auth.uid()::text);

DROP FUNCTION IF EXISTS public.start_live_stream(text, text, text);

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
SET search_path = public
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

  UPDATE public.stream_viewers sv
  SET left_at = coalesce(left_at, now())
  FROM public.live_streams ls
  WHERE ls.id = sv.stream_id
    AND ls.host_id = uid
    AND coalesce(ls.is_active, false) = true
    AND sv.left_at IS NULL;

  UPDATE public.live_streams
  SET is_active = false, ended_at = now(), viewer_count = 0, status = 'ended'
  WHERE host_id = uid AND coalesce(is_active, false) = true;

  SELECT public.can_user_go_live() INTO gate;
  IF coalesce((gate->>'allowed')::boolean, false) IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('success', false, 'code', coalesce(gate->>'code', 'denied'), 'reason', coalesce(gate->>'reason', 'Not allowed to go live.'));
  END IF;

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

COMMENT ON FUNCTION public.start_live_stream(text, text, text, uuid, text, text) IS '§3/§4: moderated title, category, privacy + optional password hash, status starting.';

REVOKE ALL ON FUNCTION public.start_live_stream(text, text, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_live_stream(text, text, text, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.start_live_stream(text, text, text, uuid, text, text) TO authenticated;