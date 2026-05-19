
-- Remove face-verification turn-head video from poster_images everywhere
DELETE FROM public.poster_images p
USING public.face_verification_submissions f
WHERE f.user_id = p.user_id
  AND f.video_url IS NOT NULL
  AND p.image_url = f.video_url;

-- Update sync trigger: do NOT include face-verification video_url anymore.
-- Only profile photo + 3 angle photos seed the slideshow.
CREATE OR REPLACE FUNCTION public.sync_profile_on_face_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary text;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    v_primary := COALESCE(NEW.profile_photo_url, NEW.front_url, NEW.selfie_url);

    UPDATE public.profiles
    SET 
      avatar_url = COALESCE(v_primary, avatar_url),
      cover_url  = COALESCE(v_primary, cover_url),
      face_verification_image = COALESCE(v_primary, NEW.face_image_url, face_verification_image),
      updated_at = now()
    WHERE user_id = NEW.user_id;

    -- Seed poster_images (idempotent). Profile photo first, then 3 angles.
    IF NEW.profile_photo_url IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.poster_images WHERE user_id = NEW.user_id AND image_url = NEW.profile_photo_url
    ) THEN
      INSERT INTO public.poster_images(user_id, image_url, display_order, is_primary)
      VALUES (NEW.user_id, NEW.profile_photo_url, 0, true);
    END IF;
    IF NEW.front_url IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.poster_images WHERE user_id = NEW.user_id AND image_url = NEW.front_url
    ) THEN
      INSERT INTO public.poster_images(user_id, image_url, display_order, is_primary)
      VALUES (NEW.user_id, NEW.front_url, 1, false);
    END IF;
    IF NEW.left_url IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.poster_images WHERE user_id = NEW.user_id AND image_url = NEW.left_url
    ) THEN
      INSERT INTO public.poster_images(user_id, image_url, display_order, is_primary)
      VALUES (NEW.user_id, NEW.left_url, 2, false);
    END IF;
    IF NEW.right_url IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.poster_images WHERE user_id = NEW.user_id AND image_url = NEW.right_url
    ) THEN
      INSERT INTO public.poster_images(user_id, image_url, display_order, is_primary)
      VALUES (NEW.user_id, NEW.right_url, 3, false);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
