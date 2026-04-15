
-- Add filter_key column to map beauty filters to MediaPipe processor parameters
ALTER TABLE public.beauty_filters ADD COLUMN IF NOT EXISTS filter_key TEXT;
ALTER TABLE public.beauty_filters ADD COLUMN IF NOT EXISTS description TEXT;

-- Insert 13 MediaPipe AI Beauty Filters
INSERT INTO public.beauty_filters (name, description, category, file_url, preview_url, filter_type, filter_key, is_free, is_active, intensity_default, display_order, coin_price)
VALUES
  ('Skin Smoothing', 'AI-powered skin smoothing removes blemishes and pores for flawless skin', 'beauty', 'mediapipe://smoothness', '/src/assets/beauty-filters/skin-smoothing.png', 'mediapipe', 'smoothness', true, true, 0.35, 1, 0),
  ('Skin Whitening', 'Brighten and even out skin tone for a radiant glow', 'beauty', 'mediapipe://whitening', '/src/assets/beauty-filters/skin-whitening.png', 'mediapipe', 'whitening', true, true, 0.20, 2, 0),
  ('Rosy Cheeks', 'Natural blush effect adds a healthy rosy tint to cheeks', 'makeup', 'mediapipe://redness', '/src/assets/beauty-filters/rosy-cheeks.png', 'mediapipe', 'redness', true, true, 0.15, 3, 0),
  ('Sharpness', 'HD clarity enhancement for crystal-clear video quality', 'beauty', 'mediapipe://sharpness', '/src/assets/beauty-filters/sharpness.png', 'mediapipe', 'sharpness', true, true, 0.15, 4, 0),
  ('Glow', 'Soft golden glow effect for dreamy ethereal look', 'beauty', 'mediapipe://glow', '/src/assets/beauty-filters/glow.png', 'mediapipe', 'glow', true, true, 0.10, 5, 0),
  ('Warm Tone', 'Warm sunset color temperature for cozy atmosphere', 'filter', 'mediapipe://warmth', '/src/assets/beauty-filters/warm-tone.png', 'mediapipe', 'warmth', true, true, 0.15, 6, 0),
  ('Eye Brightening', 'Make eyes sparkle with subtle brightening effect', 'beauty', 'mediapipe://eyeBright', '/src/assets/beauty-filters/eye-bright.png', 'mediapipe', 'eyeBright', true, true, 0.15, 7, 0),
  ('Skin Tone', 'Adjust skin tone from cool to warm for perfect match', 'skin', 'mediapipe://skinTone', '/src/assets/beauty-filters/skin-tone.png', 'mediapipe', 'skinTone', true, true, 0.50, 8, 0),
  ('Face Slim', 'AI face reshaping for a slimmer V-line face contour', 'face_shape', 'mediapipe://faceSlim', '/src/assets/beauty-filters/face-slim.png', 'mediapipe', 'faceSlim', true, true, 0.15, 9, 0),
  ('V-Line Chin', 'Slim and reshape chin for elegant V-line jawline', 'face_shape', 'mediapipe://chinSlim', '/src/assets/beauty-filters/chin-slim.png', 'mediapipe', 'chinSlim', true, true, 0.10, 10, 0),
  ('Eye Enlarge', 'Subtly enlarge eyes for a brighter, more expressive look', 'face_shape', 'mediapipe://eyeEnlarge', '/src/assets/beauty-filters/eye-enlarge.png', 'mediapipe', 'eyeEnlarge', true, true, 0.10, 11, 0),
  ('Nose Narrow', 'Refine nose shape for a more defined profile', 'face_shape', 'mediapipe://noseNarrow', '/src/assets/beauty-filters/nose-narrow.png', 'mediapipe', 'noseNarrow', true, true, 0.05, 12, 0),
  ('Lip Color', 'Natural lip tint overlay for beautiful colored lips', 'makeup', 'mediapipe://lipColor', '/src/assets/beauty-filters/lip-color.png', 'mediapipe', 'lipColor', true, true, 0.10, 13, 0);
