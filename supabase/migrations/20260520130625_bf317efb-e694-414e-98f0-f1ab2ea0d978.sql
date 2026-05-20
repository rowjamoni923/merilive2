-- Pkg63 — Rating proof: unblock submissions + allow re-submit after rejection
-- 1) Drop the over-strict platform CHECK that silently rejected every insert
--    (app sends 'android'/'ios'/'web', check required 'google_play'/'app_store')
ALTER TABLE public.rating_reward_claims
  DROP CONSTRAINT IF EXISTS rating_reward_claims_platform_check;

-- Normalize platform values going forward (informational only, no constraint)
ALTER TABLE public.rating_reward_claims
  ALTER COLUMN platform SET DEFAULT 'unknown';

-- 2) Allow a user to submit a NEW claim after a previous one was rejected.
--    Partial unique: at most one row per user that is still pending OR approved.
--    Rejected rows do NOT count, so the user can retry.
DROP INDEX IF EXISTS public.uniq_rating_reward_claim_per_user_active;
CREATE UNIQUE INDEX uniq_rating_reward_claim_per_user_active
  ON public.rating_reward_claims (user_id)
  WHERE status IN ('pending', 'approved');

-- 3) Make sure user can SELECT their own claim status (already true via owner
--    policy, but re-assert to guarantee the reflection-back-to-user works).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rating_reward_claims'
      AND policyname = 'rating_claims_owner_select'
  ) THEN
    CREATE POLICY rating_claims_owner_select
      ON public.rating_reward_claims
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;