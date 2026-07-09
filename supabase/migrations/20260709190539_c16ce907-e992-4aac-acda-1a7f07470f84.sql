
INSERT INTO public.wallet_ledger_audit(user_id, currency, delta, source_type, source_id, source_table, metadata, created_at)
SELECT user_id, 'coins', bonus_coins, 'registration_bonus', id::text, 'registration_bonus_claims', '{}'::jsonb, granted_at
FROM public.registration_bonus_claims
WHERE granted_at > now() - interval '180 days' AND user_id IS NOT NULL AND bonus_coins > 0;

INSERT INTO public.wallet_ledger_audit(user_id, currency, delta, source_type, source_id, source_table, metadata, created_at)
SELECT user_id, 'coins', bonus_amount, 'first_recharge_bonus', id::text, 'first_recharge_claims', jsonb_build_object('original_amount', original_amount), claimed_at
FROM public.first_recharge_claims
WHERE claimed_at > now() - interval '180 days' AND user_id IS NOT NULL AND bonus_amount > 0;

INSERT INTO public.wallet_ledger_audit(user_id, currency, delta, source_type, source_id, source_table, metadata, created_at)
SELECT claimed_by, COALESCE(reward_type,'coins'), reward_amount, 'invitation_reward', id::text, 'invitation_reward_claims', jsonb_build_object('invitation_id', invitation_id), claimed_at
FROM public.invitation_reward_claims
WHERE claimed_at > now() - interval '180 days' AND claimed_by IS NOT NULL AND reward_amount > 0;

INSERT INTO public.wallet_ledger_audit(user_id, currency, delta, source_type, source_id, source_table, metadata, created_at)
SELECT host_id, 'coins', COALESCE(claimed_beans, 0), 'new_host_live_bonus', id::text, 'new_host_live_bonus_progress',
  jsonb_build_object('program_day', program_day, 'hour_number', hour_number, 'minutes_accumulated', minutes_accumulated),
  COALESCE(claimed_at, updated_at, created_at)
FROM public.new_host_live_bonus_progress
WHERE COALESCE(claimed_at, updated_at, created_at) > now() - interval '180 days'
  AND host_id IS NOT NULL AND bonus_claimed = true AND COALESCE(claimed_beans, 0) > 0;

CREATE OR REPLACE VIEW public.admin_rewards_health AS
SELECT 'daily_task_progress' AS pipeline,
  (SELECT count(*) FROM public.user_task_progress) AS total_rows,
  (SELECT count(*) FROM public.user_task_progress WHERE is_completed) AS completed_rows,
  (SELECT count(*) FROM public.user_task_progress WHERE reward_claimed) AS reward_claimed_rows,
  (SELECT max(updated_at) FROM public.user_task_progress) AS last_activity
UNION ALL SELECT 'new_host_live_bonus',
  (SELECT count(*) FROM public.new_host_live_bonus_progress),
  (SELECT count(*) FROM public.new_host_live_bonus_progress WHERE bonus_claimed),
  (SELECT count(*) FROM public.new_host_live_bonus_progress WHERE bonus_claimed),
  (SELECT max(COALESCE(claimed_at, updated_at, created_at)) FROM public.new_host_live_bonus_progress)
UNION ALL SELECT 'daily_login_claims',
  (SELECT count(*) FROM public.daily_login_claims),
  (SELECT count(*) FROM public.daily_login_claims WHERE reward_amount > 0),
  (SELECT count(*) FROM public.daily_login_claims WHERE reward_amount > 0),
  (SELECT max(claimed_at) FROM public.daily_login_claims)
UNION ALL SELECT 'rating_reward_claims',
  (SELECT count(*) FROM public.rating_reward_claims),
  (SELECT count(*) FROM public.rating_reward_claims WHERE status = 'approved'),
  (SELECT count(*) FROM public.rating_reward_claims WHERE status = 'approved'),
  (SELECT max(COALESCE(reviewed_at, created_at)) FROM public.rating_reward_claims)
UNION ALL SELECT 'invitation_reward_claims',
  (SELECT count(*) FROM public.invitation_reward_claims),
  (SELECT count(*) FROM public.invitation_reward_claims),
  (SELECT count(*) FROM public.invitation_reward_claims),
  (SELECT max(claimed_at) FROM public.invitation_reward_claims)
UNION ALL SELECT 'registration_bonus_claims',
  (SELECT count(*) FROM public.registration_bonus_claims),
  (SELECT count(*) FROM public.registration_bonus_claims),
  (SELECT count(*) FROM public.registration_bonus_claims),
  (SELECT max(granted_at) FROM public.registration_bonus_claims)
UNION ALL SELECT 'first_recharge_claims',
  (SELECT count(*) FROM public.first_recharge_claims),
  (SELECT count(*) FROM public.first_recharge_claims),
  (SELECT count(*) FROM public.first_recharge_claims),
  (SELECT max(claimed_at) FROM public.first_recharge_claims);

GRANT SELECT ON public.admin_rewards_health TO authenticated;
