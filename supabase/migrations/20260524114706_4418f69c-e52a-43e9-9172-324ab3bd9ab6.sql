-- Pkg303 Settings deep audit: prevent duplicate block rows created by legacy two-table sync.

-- Keep the oldest row per blocker/blocked pair before adding the uniqueness rule.
WITH ranked AS (
  SELECT
    ctid,
    row_number() OVER (
      PARTITION BY blocker_id, blocked_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.user_blocks
)
DELETE FROM public.user_blocks ub
USING ranked r
WHERE ub.ctid = r.ctid
  AND r.rn > 1;

-- Ensure user_blocks has a primary key on its existing id column if one is missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.user_blocks'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.user_blocks
      ADD CONSTRAINT user_blocks_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- Prevent the sync trigger from inserting a second row for the same relationship.
ALTER TABLE public.user_blocks
  DROP CONSTRAINT IF EXISTS user_blocks_blocker_id_blocked_id_key,
  ADD CONSTRAINT user_blocks_blocker_id_blocked_id_key UNIQUE (blocker_id, blocked_id);
