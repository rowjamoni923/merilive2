-- Phase 4: Unified payout forensics + fraud signals

CREATE OR REPLACE VIEW public.admin_payout_unified AS
SELECT
  'agency_withdrawal'::text AS source,
  aw.id::text AS id,
  aw.agency_id::text AS entity_id,
  a.owner_id AS user_id,
  a.name AS entity_name,
  aw.amount::numeric AS amount_native,
  aw.usd_amount::numeric AS usd_amount,
  aw.status,
  aw.payment_method,
  aw.payment_method_type,
  aw.processed_by,
  aw.requested_at AS created_at,
  aw.processed_at
FROM public.agency_withdrawals aw
LEFT JOIN public.agencies a ON a.id = aw.agency_id
UNION ALL
SELECT
  'helper_withdrawal'::text,
  hw.id::text,
  hw.helper_id::text,
  hw.helper_id AS user_id,
  NULL::text AS entity_name,
  hw.amount::numeric,
  hw.usd_amount::numeric,
  hw.status,
  NULL::text AS payment_method,
  NULL::text AS payment_method_type,
  hw.processed_by,
  hw.created_at,
  hw.processed_at
FROM public.helper_withdrawal_requests hw
UNION ALL
SELECT
  'agency_earnings_transfer'::text,
  aet.id::text,
  aet.agency_id::text,
  a.owner_id,
  a.name,
  aet.amount::numeric,
  NULL::numeric,
  aet.status,
  NULL::text,
  NULL::text,
  NULL::uuid,
  aet.created_at,
  aet.processed_at
FROM public.agency_earnings_transfers aet
LEFT JOIN public.agencies a ON a.id = aet.agency_id;

GRANT SELECT ON public.admin_payout_unified TO authenticated;

-- Fraud signals: first-day withdrawal, same-day-signup-and-withdraw, high-value new-account
CREATE OR REPLACE VIEW public.admin_payout_fraud_signals AS
WITH payouts AS (
  SELECT source, id, entity_id, user_id, entity_name, amount_native, usd_amount,
         status, payment_method, created_at, processed_at
  FROM public.admin_payout_unified
  WHERE status IN ('pending','processing','paid','approved')
    AND created_at > now() - interval '90 days'
)
SELECT
  p.source,
  p.id,
  p.entity_id,
  p.user_id,
  p.entity_name,
  p.amount_native,
  p.usd_amount,
  p.status,
  p.payment_method,
  p.created_at,
  pr.username,
  pr.created_at AS account_created_at,
  EXTRACT(EPOCH FROM (p.created_at - pr.created_at)) / 86400.0 AS account_age_days_at_request,
  CASE
    WHEN pr.created_at IS NULL THEN 'unknown_account'
    WHEN p.created_at - pr.created_at < interval '24 hours' THEN 'same_day_signup_withdraw'
    WHEN p.created_at - pr.created_at < interval '7 days' AND COALESCE(p.usd_amount, 0) >= 50 THEN 'new_account_high_value'
    WHEN p.created_at - pr.created_at < interval '7 days' THEN 'first_week_withdraw'
    ELSE NULL
  END AS signal
FROM payouts p
LEFT JOIN public.profiles pr ON pr.id = p.user_id
WHERE (pr.created_at IS NULL OR p.created_at - pr.created_at < interval '7 days')
ORDER BY p.created_at DESC
LIMIT 500;

GRANT SELECT ON public.admin_payout_fraud_signals TO authenticated;

-- Per-processor audit: which admin approved how many payouts, total value
CREATE OR REPLACE VIEW public.admin_payout_processor_stats AS
SELECT
  processed_by,
  source,
  COUNT(*)::int AS payout_count,
  SUM(COALESCE(usd_amount, 0))::numeric AS total_usd,
  MIN(processed_at) AS first_processed,
  MAX(processed_at) AS last_processed
FROM public.admin_payout_unified
WHERE processed_by IS NOT NULL
  AND status IN ('paid','approved')
  AND processed_at > now() - interval '90 days'
GROUP BY processed_by, source
ORDER BY total_usd DESC;

GRANT SELECT ON public.admin_payout_processor_stats TO authenticated;