DELETE FROM public.first_recharge_claims a
USING public.first_recharge_claims b
WHERE a.user_id = b.user_id
  AND a.claimed_at > b.claimed_at;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_first_recharge_claims_user
  ON public.first_recharge_claims(user_id);