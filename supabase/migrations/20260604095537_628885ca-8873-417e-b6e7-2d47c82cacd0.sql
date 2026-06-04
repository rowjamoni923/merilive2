ALTER TABLE public.level_privileges
  ADD COLUMN IF NOT EXISTS animation_format text,
  ADD COLUMN IF NOT EXISTS animation_config_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'level_privileges_animation_format_check'
  ) THEN
    ALTER TABLE public.level_privileges
      ADD CONSTRAINT level_privileges_animation_format_check
      CHECK (animation_format IS NULL OR animation_format IN ('svga','vap','lottie','webp','png','gif','mp4','webm'));
  END IF;
END $$;