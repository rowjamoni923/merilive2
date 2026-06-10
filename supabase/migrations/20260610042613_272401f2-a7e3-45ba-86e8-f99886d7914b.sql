
-- ============================================================================
-- Phase 3 — Financial Hardening
-- ============================================================================

-- H-15: Defense-in-depth — revoke ALL anon access from financial tables.
-- RLS already blocks anon, but Supabase's default ACL still grants the
-- bits to anon. We remove them so a future permissive policy can't
-- accidentally expose money flows.
DO $$
DECLARE
  t text;
  financial_tables text[] := ARRAY[
    'gift_transactions','gift_transaction_logs',
    'payment_transactions','payment_reconciliation_log',
    'billing_ledger','balance_audit_log',
    'coin_transactions','coin_transfers','coin_trader_transfers',
    'user_beans_exchanges','user_beans_exchange_history',
    'recharge_transactions','swift_pay_topups',
    'agency_earnings_transfers','agency_withdrawals','agency_diamond_transactions',
    'helper_orders','helper_transactions','helper_topup_requests',
    'helper_withdrawal_requests','game_transactions','game_bets'
  ];
BEGIN
  FOREACH t IN ARRAY financial_tables LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=t AND c.relkind='r'
    ) THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
      EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    END IF;
  END LOOP;
END $$;

-- M-5: Agency beans_balance can never go negative.
ALTER TABLE public.agencies
  DROP CONSTRAINT IF EXISTS agencies_beans_balance_nonneg;
ALTER TABLE public.agencies
  ADD CONSTRAINT agencies_beans_balance_nonneg
  CHECK (beans_balance >= 0) NOT VALID;
ALTER TABLE public.agencies VALIDATE CONSTRAINT agencies_beans_balance_nonneg;

-- M-7: Provider payment_id on swift-pay top-ups must be unique when present.
-- Prevents the polling cron from double-crediting the same crypto invoice
-- if it sees the row simultaneously from two workers.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_swift_pay_topups_payment_id
  ON public.swift_pay_topups (payment_id)
  WHERE payment_id IS NOT NULL AND payment_id <> '';
