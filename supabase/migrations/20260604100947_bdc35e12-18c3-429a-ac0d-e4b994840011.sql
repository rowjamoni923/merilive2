-- Pkg424: Unified animation columns across remaining admin-managed tables
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'vip_medals','vip_tiers','noble_cards','user_level_tiers',
    'party_room_banners','pk_reward_banners','popup_event_banners',
    'banners','rating_banners','ar_stickers','beauty_filters',
    'leaderboard_podium_frames','parcel_templates','daily_tasks',
    'invitation_reward_tiers','welcome_bonuses','first_recharge_bonus',
    'recharge_campaigns','limited_time_offers','app_event_themes',
    'onboarding_slides'
  ]) LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS animation_format text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS animation_config_url text', t);
    -- Make sure animation_url exists too
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS animation_url text', t);
    -- CHECK constraint (drop if exists, then add)
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      t, t || '_animation_format_check');
    EXECUTE format($q$ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (animation_format IS NULL OR animation_format IN ('svga','vap','lottie','webp','png','gif','mp4','jpg','jpeg'))$q$,
      t, t || '_animation_format_check');
  END LOOP;
END $$;