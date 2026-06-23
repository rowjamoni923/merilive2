ALTER TABLE public.limited_time_offers
  ALTER COLUMN coins_amount SET DEFAULT 0,
  ALTER COLUMN original_price SET DEFAULT 0,
  ALTER COLUMN offer_price SET DEFAULT 0,
  ALTER COLUMN starts_at SET DEFAULT now();

ALTER TABLE public.daily_login_rewards_config
  ALTER COLUMN reward_type SET DEFAULT 'diamonds',
  ALTER COLUMN reward_amount SET DEFAULT 0;

ALTER TABLE public.user_beans_exchange_tiers
  ALTER COLUMN tier_name SET DEFAULT 'New Tier';