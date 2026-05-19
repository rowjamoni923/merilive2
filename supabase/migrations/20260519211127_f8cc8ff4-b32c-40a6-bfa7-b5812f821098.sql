
-- Trigger: prefer profile_photo_url for BOTH avatar and cover (full-screen)
CREATE OR REPLACE FUNCTION public.sync_profile_on_face_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _face_url text;
  _avatar_src text;
  _cover_src text;
  _approve_as text;
  _profile_gender text;
  _is_female boolean;
  _order int := 0;
  _url text;
  _urls text[];
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  _face_url   := COALESCE(NEW.profile_photo_url, NEW.front_url, NEW.selfie_url, NEW.face_image_url);
  _avatar_src := COALESCE(NEW.profile_photo_url, NEW.front_url, NEW.selfie_url);
  -- Cover = same profile photo so the full-screen image matches the avatar
  _cover_src  := COALESCE(NEW.profile_photo_url, NEW.front_url, NEW.selfie_url);
  _approve_as := COALESCE(NEW.verification_type, 'user');

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF NEW.status = 'approved' THEN
    SELECT lower(trim(COALESCE(gender, ''))) INTO _profile_gender
    FROM public.profiles WHERE id = NEW.user_id;

    _is_female := (_approve_as = 'host' OR _profile_gender = 'female');

    UPDATE public.profiles
    SET is_verified = TRUE,
        is_face_verified = TRUE,
        face_verification_image = COALESCE(_face_url, face_verification_image),
        avatar_url = COALESCE(_avatar_src, avatar_url),
        cover_url  = COALESCE(_cover_src,  cover_url),
        face_verified_at = COALESCE(face_verified_at, now()),
        face_verification_status = 'approved',
        is_host = _is_female,
        host_status = CASE WHEN _is_female THEN 'approved' ELSE NULL END,
        updated_at = now()
    WHERE id = NEW.user_id;

    -- Seed poster_images (profile photo first, then 3 angles, then video). Idempotent.
    _urls := ARRAY[
      NEW.profile_photo_url,
      NEW.front_url,
      NEW.left_url,
      NEW.right_url,
      NEW.video_url
    ];

    FOREACH _url IN ARRAY _urls LOOP
      IF _url IS NOT NULL AND length(trim(_url)) > 0 THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.poster_images
          WHERE user_id = NEW.user_id AND image_url = _url
        ) THEN
          INSERT INTO public.poster_images (user_id, image_url, display_order, is_primary)
          VALUES (NEW.user_id, _url, _order, _order = 0);
        END IF;
        _order := _order + 1;
      END IF;
    END LOOP;

  ELSIF NEW.status = 'rejected' THEN
    UPDATE public.profiles
    SET is_face_verified = FALSE,
        face_verification_image = NULL,
        face_verified_at = NULL,
        face_verification_status = 'rejected',
        is_host = CASE WHEN lower(trim(COALESCE(gender, ''))) = 'female' THEN FALSE ELSE is_host END,
        host_status = CASE WHEN lower(trim(COALESCE(gender, ''))) = 'female' THEN 'rejected' ELSE host_status END,
        updated_at = now()
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: force avatar AND cover to profile_photo_url for every approved host (overwrite older mismatched cover)
DO $$
DECLARE r record;
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  FOR r IN
    SELECT DISTINCT ON (user_id)
      user_id,
      COALESCE(profile_photo_url, front_url, selfie_url) AS src
    FROM public.face_verification_submissions
    WHERE status = 'approved'
    ORDER BY user_id, reviewed_at DESC NULLS LAST, created_at DESC
  LOOP
    IF r.src IS NOT NULL THEN
      UPDATE public.profiles
      SET avatar_url = r.src,
          cover_url  = r.src
      WHERE id = r.user_id;
    END IF;
  END LOOP;
END $$;
