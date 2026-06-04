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
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, 'chk_' || t || '_animation_format');
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (
          animation_format IS NULL OR animation_format IN (
            ''svga'',''vap'',''pag'',''lottie'',''webp'',''png'',''gif'',''mp4'',''webm''
          )
        )',
        t,
        'chk_' || t || '_animation_format'
      );

      -- VAP config is optional for standard side-by-side Tencent VAP MP4; the web/native player can auto-detect.
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, 'chk_' || t || '_vap_config');
    END IF;
  END LOOP;
END $$;