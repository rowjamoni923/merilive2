-- Phase 3: Per-user reconciliation + suspicious pattern views

-- Reconciliation view: profile balance vs sum(ledger delta)
CREATE OR REPLACE VIEW public.admin_wallet_reconciliation AS
WITH sums AS (
  SELECT
    user_id,
    currency,
    COALESCE(SUM(delta), 0)::numeric AS ledger_sum,
    COUNT(*)::int AS ledger_entries,
    MAX(created_at) AS last_movement
  FROM public.wallet_ledger_audit
  GROUP BY user_id, currency
),
profile_bal AS (
  SELECT id AS user_id, 'beans'::text AS currency, COALESCE(beans, 0)::numeric AS balance FROM public.profiles
  UNION ALL
  SELECT id, 'diamonds', COALESCE(diamonds, 0)::numeric FROM public.profiles
  UNION ALL
  SELECT id, 'coins', COALESCE(coins, 0)::numeric FROM public.profiles
)
SELECT
  p.user_id,
  p.currency,
  p.balance AS profile_balance,
  COALESCE(s.ledger_sum, 0) AS ledger_sum,
  (p.balance - COALESCE(s.ledger_sum, 0)) AS drift,
  COALESCE(s.ledger_entries, 0) AS ledger_entries,
  s.last_movement
FROM profile_bal p
LEFT JOIN sums s ON s.user_id = p.user_id AND s.currency = p.currency;

GRANT SELECT ON public.admin_wallet_reconciliation TO authenticated;

-- Suspicious activity view: IP/device clusters + rapid-fire earning
CREATE OR REPLACE VIEW public.admin_wallet_suspicious_clusters AS
WITH ip_clusters AS (
  SELECT
    ip_address::text AS cluster_key,
    'ip'::text AS cluster_type,
    COUNT(DISTINCT user_id)::int AS user_count,
    COUNT(*)::int AS event_count,
    SUM(GREATEST(delta, 0))::numeric AS total_credited,
    array_agg(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS user_ids,
    MIN(created_at) AS first_seen,
    MAX(created_at) AS last_seen
  FROM public.wallet_ledger_audit
  WHERE ip_address IS NOT NULL
    AND created_at > now() - interval '30 days'
    AND delta > 0
    AND source_type IN ('daily_login','rating_reward','invitation_reward','new_host_bonus','task_reward','welcome_bonus','first_recharge')
  GROUP BY ip_address
  HAVING COUNT(DISTINCT user_id) >= 3
),
device_clusters AS (
  SELECT
    device_id AS cluster_key,
    'device'::text AS cluster_type,
    COUNT(DISTINCT user_id)::int AS user_count,
    COUNT(*)::int AS event_count,
    SUM(GREATEST(delta, 0))::numeric AS total_credited,
    array_agg(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS user_ids,
    MIN(created_at) AS first_seen,
    MAX(created_at) AS last_seen
  FROM public.wallet_ledger_audit
  WHERE device_id IS NOT NULL
    AND created_at > now() - interval '30 days'
    AND delta > 0
    AND source_type IN ('daily_login','rating_reward','invitation_reward','new_host_bonus','task_reward','welcome_bonus','first_recharge')
  GROUP BY device_id
  HAVING COUNT(DISTINCT user_id) >= 2
)
SELECT * FROM ip_clusters
UNION ALL
SELECT * FROM device_clusters
ORDER BY user_count DESC, total_credited DESC;

GRANT SELECT ON public.admin_wallet_suspicious_clusters TO authenticated;

-- Rapid-fire earning: same user, many credits in short window
CREATE OR REPLACE VIEW public.admin_wallet_rapid_earners AS
SELECT
  user_id,
  currency,
  source_type,
  date_trunc('hour', created_at) AS hour_bucket,
  COUNT(*)::int AS event_count,
  SUM(delta)::numeric AS total_delta
FROM public.wallet_ledger_audit
WHERE created_at > now() - interval '7 days'
  AND delta > 0
GROUP BY user_id, currency, source_type, date_trunc('hour', created_at)
HAVING COUNT(*) >= 10
ORDER BY event_count DESC
LIMIT 500;

GRANT SELECT ON public.admin_wallet_rapid_earners TO authenticated;