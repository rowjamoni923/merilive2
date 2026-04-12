-- Fix 1: Add missing columns to user_level_tiers
ALTER TABLE public.user_level_tiers 
  ADD COLUMN IF NOT EXISTS min_topup_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_earning_amount numeric DEFAULT 0;

-- Fix 2: Add missing column to user_task_progress (is_claimed alias)
-- DB has 'reward_claimed', code expects 'is_claimed'
-- Add is_claimed as a generated column that mirrors reward_claimed
ALTER TABLE public.user_task_progress
  ADD COLUMN IF NOT EXISTS is_claimed boolean GENERATED ALWAYS AS (reward_claimed) STORED;

-- Fix 3: Add missing created_at to daily_login_claims
ALTER TABLE public.daily_login_claims
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();