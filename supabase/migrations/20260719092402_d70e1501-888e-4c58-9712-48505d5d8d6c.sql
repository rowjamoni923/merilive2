
-- 1) Admin wallet reconciliation view: profile balance vs ledger sum, per currency
CREATE OR REPLACE VIEW public.admin_wallet_reconciliation
WITH (security_invoker = true)
AS
WITH ledger AS (
  SELECT user_id,
         currency,
         COALESCE(SUM(delta), 0)::numeric AS ledger_sum,
         COUNT(*)::bigint                  AS ledger_entries,
         MAX(created_at)                   AS last_movement
  FROM public.wallet_ledger_audit
  GROUP BY user_id, currency
),
profile_bal AS (
  SELECT id AS user_id, 'diamonds'::text AS currency, COALESCE(diamonds, 0)::numeric AS profile_balance FROM public.profiles
  UNION ALL
  SELECT id AS user_id, 'beans'::text     AS currency, COALESCE(beans, 0)::numeric    AS profile_balance FROM public.profiles
)
SELECT
  COALESCE(p.user_id, l.user_id)                    AS user_id,
  COALESCE(p.currency, l.currency)                  AS currency,
  COALESCE(p.profile_balance, 0)                    AS profile_balance,
  COALESCE(l.ledger_sum, 0)                         AS ledger_sum,
  (COALESCE(p.profile_balance, 0) - COALESCE(l.ledger_sum, 0)) AS drift,
  COALESCE(l.ledger_entries, 0)                     AS ledger_entries,
  l.last_movement                                   AS last_movement
FROM profile_bal p
FULL OUTER JOIN ledger l
  ON l.user_id = p.user_id AND l.currency = p.currency;

REVOKE ALL ON public.admin_wallet_reconciliation FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_wallet_reconciliation TO authenticated, service_role;

-- 2) Force PostgREST schema cache reload so cached "gc.diamonds does not exist" clears
NOTIFY pgrst, 'reload schema';
