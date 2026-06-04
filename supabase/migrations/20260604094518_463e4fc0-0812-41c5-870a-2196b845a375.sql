
-- Pkg423: Unified animation format support across gifts / entry animations / shop
-- Add animation_format + animation_config_url to every animation-bearing table.
-- Existing rows keep working via URL-based auto-detect in the universal players.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'gifts',
    'avatar_frames',
    'role_frames',
    'chat_bubbles',
    'entry_effects',
    'entry_banners',
    'entry_name_bars',
    'vehicle_entrances',
    'shop_items',
    'party_room_backgrounds',
    'level_animations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- animation_format column
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'animation_format'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN animation_format text NULL',
        t
      );
    END IF;

    -- animation_config_url column (for VAP vapc.json)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'animation_config_url'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN animation_config_url text NULL',
        t
      );
    END IF;

    -- Whitelist constraint (idempotent: drop+add)
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      t, 'chk_' || t || '_animation_format'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (
        animation_format IS NULL OR animation_format IN (
          ''svga'',''vap'',''lottie'',''webp'',''png'',''gif'',''mp4'',''webm''
        )
      )',
      t, 'chk_' || t || '_animation_format'
    );

    -- VAP requires config URL
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      t, 'chk_' || t || '_vap_config'
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (
        animation_format IS DISTINCT FROM ''vap'' OR animation_config_url IS NOT NULL
      )',
      t, 'chk_' || t || '_vap_config'
    );
  END LOOP;
END $$;
