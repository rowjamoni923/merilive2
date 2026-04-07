ALTER TABLE public.ranking_rewards DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.level_animations DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.invitation_reward_tiers (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tier_name TEXT NOT NULL,
    min_invites INT NOT NULL DEFAULT 0,
    max_invites INT,
    reward_beans INT,
    reward_coins INT,
    bonus_percentage NUMERIC DEFAULT 0,
    badge_icon TEXT,
    badge_color TEXT,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invitation_reward_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view invitation reward tiers"
ON public.invitation_reward_tiers FOR SELECT
USING (true);