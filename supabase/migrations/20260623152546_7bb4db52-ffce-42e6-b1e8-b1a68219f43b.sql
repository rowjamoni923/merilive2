-- Add missing agency_id column to leaderboard_reward_history for agency leaderboard rewards
ALTER TABLE public.leaderboard_reward_history
  ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.agencies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_leaderboard_reward_history_agency
  ON public.leaderboard_reward_history(agency_id)
  WHERE agency_id IS NOT NULL;

-- Allow user_id to be NULL when row is an agency reward
ALTER TABLE public.leaderboard_reward_history
  ALTER COLUMN user_id DROP NOT NULL;

-- Ensure at least one recipient identifier is present
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leaderboard_reward_history_recipient_chk'
  ) THEN
    ALTER TABLE public.leaderboard_reward_history
      ADD CONSTRAINT leaderboard_reward_history_recipient_chk
      CHECK (user_id IS NOT NULL OR agency_id IS NOT NULL);
  END IF;
END $$;