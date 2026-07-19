-- DU-5A retry: handle dependents before dropping profiles.coins.

-- 1) Drop DU-2A mirror trigger + function.
DROP TRIGGER IF EXISTS trg_du2_sync_spend_wallet ON public.profiles;
DROP FUNCTION IF EXISTS public.du2_sync_spend_wallet();

-- 2) Drop dependent triggers (they'll be recreated below without `coins` in the OF list).
DROP TRIGGER IF EXISTS trigger_auto_update_level_profiles ON public.profiles;
DROP TRIGGER IF EXISTS tg_app_sync_profiles_balance ON public.profiles;
DROP TRIGGER IF EXISTS trg_log_wallet_change ON public.profiles;

-- 3) Drop dependent view (recreated after column swap).
DROP VIEW IF EXISTS public.admin_wallet_reconciliation;

-- 4) Harden diamonds as the canonical spend column.
UPDATE public.profiles SET diamonds = 0 WHERE diamonds IS NULL;
ALTER TABLE public.profiles ALTER COLUMN diamonds SET DEFAULT 0;
ALTER TABLE public.profiles ALTER COLUMN diamonds SET NOT NULL;

-- 5) Drop legacy coins column and recreate as generated alias of diamonds.
ALTER TABLE public.profiles DROP COLUMN coins;
ALTER TABLE public.profiles ADD COLUMN coins integer GENERATED ALWAYS AS (diamonds) STORED;

-- 6) Recreate dependent triggers. `coins` is generated from `diamonds`, so watching
--    `diamonds` covers every wallet mutation. Business logic in the trigger functions
--    is untouched.
CREATE TRIGGER tg_app_sync_profiles_balance
  AFTER INSERT OR UPDATE OF diamonds, beans ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_app_sync_profiles_balance();

CREATE TRIGGER trg_log_wallet_change
  AFTER UPDATE OF beans, diamonds ON public.profiles
  FOR EACH ROW
  WHEN ((OLD.beans IS DISTINCT FROM NEW.beans) OR (OLD.diamonds IS DISTINCT FROM NEW.diamonds))
  EXECUTE FUNCTION public.log_wallet_change();

CREATE TRIGGER trigger_auto_update_level_profiles
  AFTER INSERT OR UPDATE OF diamonds, total_consumption, total_earnings, total_recharged, is_host, weekly_earnings
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.auto_update_level();

-- 7) Recreate the admin reconciliation view; `coins` row now mirrors `diamonds`
--    automatically (generated column), so numbers are identical.
CREATE VIEW public.admin_wallet_reconciliation AS
WITH sums AS (
  SELECT
    user_id,
    currency,
    COALESCE(sum(delta), 0::numeric) AS ledger_sum,
    count(*)::integer AS ledger_entries,
    max(created_at) AS last_movement
  FROM public.wallet_ledger_audit
  GROUP BY user_id, currency
),
profile_bal AS (
  SELECT id AS user_id, 'beans'::text AS currency, COALESCE(beans, 0)::numeric AS balance FROM public.profiles
  UNION ALL
  SELECT id, 'diamonds'::text, COALESCE(diamonds, 0)::numeric FROM public.profiles
  UNION ALL
  SELECT id, 'coins'::text, COALESCE(coins, 0)::numeric FROM public.profiles
)
SELECT
  p.user_id,
  p.currency,
  p.balance AS profile_balance,
  COALESCE(s.ledger_sum, 0::numeric) AS ledger_sum,
  p.balance - COALESCE(s.ledger_sum, 0::numeric) AS drift,
  COALESCE(s.ledger_entries, 0) AS ledger_entries,
  s.last_movement
FROM profile_bal p
LEFT JOIN sums s ON s.user_id = p.user_id AND s.currency = p.currency;