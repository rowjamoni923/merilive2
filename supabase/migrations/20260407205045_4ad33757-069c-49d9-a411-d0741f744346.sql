ALTER TABLE public.level_animations ALTER COLUMN animation_url DROP NOT NULL;
ALTER TABLE public.invitation_reward_tiers DISABLE ROW LEVEL SECURITY;