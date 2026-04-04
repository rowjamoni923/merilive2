-- 1) Safety cleanup: keep oldest claim per user, remove extras if any
WITH ranked_claims AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.rating_reward_claims
)
DELETE FROM public.rating_reward_claims
WHERE id IN (
  SELECT id FROM ranked_claims WHERE rn > 1
);

-- 2) Enforce one-time claim per user at database level
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rating_reward_claims_user_id_unique'
      AND conrelid = 'public.rating_reward_claims'::regclass
  ) THEN
    ALTER TABLE public.rating_reward_claims
      ADD CONSTRAINT rating_reward_claims_user_id_unique UNIQUE (user_id);
  END IF;
END $$;