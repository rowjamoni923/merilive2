-- 1. Sanitize placeholder avatar/cover values
UPDATE public.profiles
SET avatar_url = NULL
WHERE avatar_url IS NOT NULL
  AND (avatar_url LIKE 'admin-approved://%' OR avatar_url = '');

UPDATE public.profiles
SET cover_url = NULL
WHERE cover_url IS NOT NULL
  AND (cover_url LIKE 'admin-approved://%' OR cover_url = '');

DELETE FROM public.poster_images
WHERE image_url IS NULL
   OR image_url = ''
   OR image_url LIKE 'admin-approved://%';

-- 2. Backfill: for every host with a real avatar but zero posters, seed avatar as primary slide
INSERT INTO public.poster_images (user_id, image_url, display_order, is_primary)
SELECT p.id, p.avatar_url, 0, true
FROM public.profiles p
WHERE p.is_host = true
  AND p.avatar_url IS NOT NULL
  AND p.avatar_url <> ''
  AND p.avatar_url NOT LIKE 'admin-approved://%'
  AND NOT EXISTS (SELECT 1 FROM public.poster_images pi WHERE pi.user_id = p.id);

-- 3. Auto-seed poster from avatar when a host's avatar is set/changed and no posters exist
CREATE OR REPLACE FUNCTION public.ensure_host_avatar_poster()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_host = true
     AND NEW.avatar_url IS NOT NULL
     AND NEW.avatar_url <> ''
     AND NEW.avatar_url NOT LIKE 'admin-approved://%'
  THEN
    -- Insert avatar as primary slide if not already present for this user
    IF NOT EXISTS (
      SELECT 1 FROM public.poster_images
      WHERE user_id = NEW.id AND image_url = NEW.avatar_url
    ) THEN
      INSERT INTO public.poster_images (user_id, image_url, display_order, is_primary)
      VALUES (
        NEW.id,
        NEW.avatar_url,
        COALESCE((SELECT MIN(display_order) - 1 FROM public.poster_images WHERE user_id = NEW.id), 0),
        NOT EXISTS (SELECT 1 FROM public.poster_images WHERE user_id = NEW.id)
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_host_avatar_poster ON public.profiles;
CREATE TRIGGER trg_ensure_host_avatar_poster
AFTER INSERT OR UPDATE OF avatar_url, is_host ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_host_avatar_poster();