-- Allow any authenticated viewer to read every user's profile poster images
-- (these are public-facing profile photos meant to be seen by everyone).
DROP POLICY IF EXISTS "Anyone can view poster images" ON public.poster_images;
CREATE POLICY "Anyone can view poster images"
  ON public.poster_images
  FOR SELECT
  USING (true);