-- Fix default so new submissions land as 'pending' for admin review
ALTER TABLE public.rating_reward_claims ALTER COLUMN status SET DEFAULT 'pending';

-- Migrate legacy 'claimed' rows so admin can review them now
UPDATE public.rating_reward_claims SET status='pending' WHERE status='claimed';