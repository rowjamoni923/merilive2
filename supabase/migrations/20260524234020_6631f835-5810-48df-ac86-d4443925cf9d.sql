CREATE OR REPLACE FUNCTION public.normalize_public_profile_media_url(_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _url IS NULL OR btrim(_url) = '' THEN NULL
    WHEN _url ~* '/functions/v1/public-profile-avatar/' THEN _url
    WHEN _url ~* '/storage/v1/object/public/face-verification/' THEN regexp_replace(
      _url,
      '^https?://[^/]+/storage/v1/object/public/face-verification/',
      'https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/public-profile-avatar/'
    )
    ELSE _url
  END
$$;

CREATE OR REPLACE FUNCTION public.publish_approved_profile_media(_submission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.face_verification_submissions%ROWTYPE;
  v_profile_photo text;
  v_video text;
  v_host_photos text[] := ARRAY[]::text[];
  v_all_media text[] := ARRAY[]::text[];
  v_url text;
  v_order int := 0;
  v_cover text;
BEGIN
  SELECT * INTO v_sub
  FROM public.face_verification_submissions
  WHERE id = _submission_id
    AND status = 'approved';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_profile_photo := public.normalize_public_profile_media_url(v_sub.profile_photo_url);
  v_video := public.normalize_public_profile_media_url(v_sub.video_url);

  IF v_sub.host_photos IS NOT NULL THEN
    SELECT coalesce(array_agg(public.normalize_public_profile_media_url(x) ORDER BY ord), ARRAY[]::text[])
    INTO v_host_photos
    FROM unnest(v_sub.host_photos) WITH ORDINALITY AS u(x, ord)
    WHERE public.normalize_public_profile_media_url(x) IS NOT NULL;
  END IF;

  v_cover := coalesce(v_host_photos[1], v_profile_photo);

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET avatar_url = coalesce(v_profile_photo, avatar_url),
      profile_photo_url = coalesce(v_profile_photo, profile_photo_url),
      host_photos = CASE WHEN cardinality(v_host_photos) > 0 THEN v_host_photos ELSE host_photos END,
      cover_url = coalesce(v_cover, cover_url),
      updated_at = now()
  WHERE id = v_sub.user_id;

  v_all_media := ARRAY[]::text[];
  IF v_profile_photo IS NOT NULL THEN v_all_media := v_all_media || v_profile_photo; END IF;
  IF cardinality(v_host_photos) > 0 THEN v_all_media := v_all_media || v_host_photos; END IF;
  IF v_video IS NOT NULL THEN v_all_media := v_all_media || v_video; END IF;

  FOREACH v_url IN ARRAY v_all_media LOOP
    IF v_url IS NULL OR btrim(v_url) = '' THEN CONTINUE; END IF;

    INSERT INTO public.poster_images (user_id, image_url, display_order, is_primary)
    SELECT v_sub.user_id, v_url, v_order, (v_order = 0)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.poster_images p
      WHERE p.user_id = v_sub.user_id AND p.image_url = v_url
    );
    v_order := v_order + 1;
  END LOOP;

  UPDATE public.poster_images
  SET image_url = public.normalize_public_profile_media_url(image_url)
  WHERE user_id = v_sub.user_id
    AND image_url LIKE '%/storage/v1/object/public/face-verification/%';
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_publish_approved_profile_media()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    PERFORM public.publish_approved_profile_media(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_publish_approved_profile_media ON public.face_verification_submissions;
CREATE TRIGGER trg_publish_approved_profile_media
AFTER INSERT OR UPDATE OF status, profile_photo_url, video_url, host_photos
ON public.face_verification_submissions
FOR EACH ROW
WHEN (NEW.status = 'approved')
EXECUTE FUNCTION public.tg_publish_approved_profile_media();

DO $$
DECLARE
  r record;
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET avatar_url = public.normalize_public_profile_media_url(avatar_url),
      cover_url = public.normalize_public_profile_media_url(cover_url),
      profile_photo_url = public.normalize_public_profile_media_url(profile_photo_url),
      host_photos = CASE
        WHEN host_photos IS NULL THEN host_photos
        ELSE ARRAY(
          SELECT public.normalize_public_profile_media_url(x)
          FROM unnest(host_photos) AS x
          WHERE public.normalize_public_profile_media_url(x) IS NOT NULL
        )
      END,
      updated_at = now()
  WHERE coalesce(avatar_url,'') LIKE '%/storage/v1/object/public/face-verification/%'
     OR coalesce(cover_url,'') LIKE '%/storage/v1/object/public/face-verification/%'
     OR coalesce(profile_photo_url,'') LIKE '%/storage/v1/object/public/face-verification/%'
     OR EXISTS (SELECT 1 FROM unnest(coalesce(host_photos, ARRAY[]::text[])) x WHERE x LIKE '%/storage/v1/object/public/face-verification/%');

  UPDATE public.poster_images
  SET image_url = public.normalize_public_profile_media_url(image_url)
  WHERE image_url LIKE '%/storage/v1/object/public/face-verification/%';

  FOR r IN
    SELECT id
    FROM public.face_verification_submissions
    WHERE status = 'approved'
      AND (profile_photo_url IS NOT NULL OR video_url IS NOT NULL OR cardinality(coalesce(host_photos, ARRAY[]::text[])) > 0)
  LOOP
    PERFORM public.publish_approved_profile_media(r.id);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.normalize_public_profile_media_url(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_public_profile_media_url(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.publish_approved_profile_media(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_approved_profile_media(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.tg_publish_approved_profile_media() FROM PUBLIC;