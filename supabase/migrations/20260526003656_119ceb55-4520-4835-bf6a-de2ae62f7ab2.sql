-- Make sync_profile_on_face_verification the single gate for user-visible media.
-- Only on approval does the user's profile get their submitted photo, and for
-- hosts the 3 gallery photos + intro video. The face-verification liveness
-- video is NEVER copied to the public profile.
CREATE OR REPLACE FUNCTION public.sync_profile_on_face_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_primary text;
  v_media text;
  v_order integer;
  v_is_host_sub boolean;
BEGIN
  IF NEW.status = 'approved' THEN
    -- Treat the submission as a host application when verification_type='host'
    -- OR when host gallery media was actually supplied (defense-in-depth).
    v_is_host_sub := lower(trim(coalesce(NEW.verification_type, ''))) = 'host'
                  OR (NEW.host_photos IS NOT NULL AND array_length(NEW.host_photos, 1) > 0)
                  OR NEW.video_url IS NOT NULL;

    v_primary := COALESCE(NEW.profile_photo_url, NEW.front_url, NEW.selfie_url, NEW.face_image_url);

    -- Bypass profile-protection trigger so SECDEF can write avatar/cover/host_photos.
    PERFORM set_config('app.bypass_profile_protection', 'true', true);

    UPDATE public.profiles
    SET
      avatar_url             = COALESCE(v_primary, avatar_url),
      profile_photo_url      = COALESCE(NEW.profile_photo_url, profile_photo_url),
      -- cover_url = host intro video (NOT a still). For non-hosts keep existing.
      cover_url              = CASE WHEN v_is_host_sub THEN COALESCE(NEW.video_url, cover_url) ELSE cover_url END,
      -- 3 host gallery photos only for host submissions.
      host_photos            = CASE WHEN v_is_host_sub THEN COALESCE(NEW.host_photos, host_photos) ELSE host_photos END,
      face_verification_image = COALESCE(v_primary, face_verification_image),
      is_face_verified       = true,
      face_verified_at       = COALESCE(face_verified_at, now()),
      updated_at             = now()
    WHERE id = NEW.user_id;

    -- Rebuild the public profile slideshow from approved user-facing uploads only.
    DELETE FROM public.poster_images
    WHERE user_id = NEW.user_id
      AND (
        image_url = ANY(ARRAY[
          NEW.profile_photo_url,
          NEW.video_url,
          NEW.front_url,
          NEW.left_url,
          NEW.right_url,
          NEW.selfie_url,
          NEW.face_image_url
        ])
        OR image_url LIKE '%/face-angles/%'
        OR image_url LIKE '%/face-videos/%'
      );

    v_order := 0;

    IF NEW.profile_photo_url IS NOT NULL THEN
      INSERT INTO public.poster_images(user_id, image_url, display_order, is_primary)
      VALUES (NEW.user_id, NEW.profile_photo_url, v_order, true)
      ON CONFLICT DO NOTHING;
      v_order := v_order + 1;
    END IF;

    IF v_is_host_sub THEN
      FOREACH v_media IN ARRAY COALESCE(NEW.host_photos, ARRAY[]::text[]) LOOP
        IF v_media IS NOT NULL AND v_media <> '' THEN
          INSERT INTO public.poster_images(user_id, image_url, display_order, is_primary)
          VALUES (NEW.user_id, v_media, v_order, false)
          ON CONFLICT DO NOTHING;
          v_order := v_order + 1;
        END IF;
      END LOOP;

      -- User-uploaded intro video (NOT the face-verification turn-head video).
      IF NEW.video_url IS NOT NULL THEN
        INSERT INTO public.poster_images(user_id, image_url, display_order, is_primary)
        VALUES (NEW.user_id, NEW.video_url, v_order, false)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;