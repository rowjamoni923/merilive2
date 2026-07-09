ALTER TABLE public.swift_pay_topups
  ADD COLUMN IF NOT EXISTS last_poll_snapshot jsonb;

COMMENT ON COLUMN public.swift_pay_topups.last_poll_snapshot IS
  'Latest gateway response snapshot from swift-pay-poll-deposits: {balance, total_deposited, expected_needed, checked_at, status_code}';

CREATE OR REPLACE FUNCTION public.expire_stale_swift_pay_topups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.swift_pay_topups
     SET status = 'expired',
         error_message = COALESCE(
           error_message,
           'Auto-expired at gateway TTL (' || to_char(expires_at, 'YYYY-MM-DD HH24:MI') || 'Z) — no on-chain payment received'
         ),
         updated_at = now()
   WHERE status = 'pending'
     AND expires_at IS NOT NULL
     AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE VIEW public.admin_swift_pay_recovery_candidates AS
SELECT
  t.id,
  t.user_id,
  p.username,
  p.display_name,
  p.phone_number,
  t.external_user_id,
  t.price_usd,
  t.coins_amount,
  t.pay_currency,
  t.pay_network,
  t.pay_address,
  t.pay_amount,
  t.payment_id,
  t.status,
  t.created_at,
  t.expires_at,
  t.last_polled_at,
  t.last_poll_snapshot,
  t.error_message,
  EXTRACT(EPOCH FROM (now() - t.created_at)) / 3600.0 AS hours_since_created,
  CASE
    WHEN t.price_usd >= 15 THEN 'high_value'
    WHEN t.price_usd >= 5  THEN 'medium'
    ELSE 'low'
  END AS priority_bucket
FROM public.swift_pay_topups t
LEFT JOIN public.profiles p ON p.id = t.user_id
WHERE t.status IN ('expired', 'pending', 'paid', 'failed')
  AND t.created_at > now() - interval '30 days'
  AND t.status <> 'credited';

GRANT SELECT ON public.admin_swift_pay_recovery_candidates TO authenticated, service_role;