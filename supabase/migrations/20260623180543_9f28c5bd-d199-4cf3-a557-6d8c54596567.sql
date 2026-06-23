-- Phase 4: idempotency guard — block status transitions out of a final state.
CREATE OR REPLACE FUNCTION public.tg_guard_terminal_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_old text;
  v_new text;
BEGIN
  v_old := lower(coalesce((to_jsonb(OLD)->>'status')::text, ''));
  v_new := lower(coalesce((to_jsonb(NEW)->>'status')::text, ''));

  -- Allow no-op or non-status updates
  IF v_old = v_new THEN
    RETURN NEW;
  END IF;

  -- Block changes when row is already in a terminal state.
  IF v_old IN ('approved','rejected','completed','paid','cancelled','canceled','failed','refunded') THEN
    RAISE EXCEPTION 'Row % already in terminal state %, cannot transition to %',
      coalesce((to_jsonb(OLD)->>'id'), '?'), v_old, v_new
      USING ERRCODE = '40001'; -- serialization_failure → safe to retry on client
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'helper_applications','helper_topup_requests','helper_upgrade_requests',
    'helper_withdrawal_requests','helper_orders','agency_withdrawals',
    'recharge_transactions','host_applications','host_conversion_requests',
    'swift_pay_topups','payroll_requests','rating_reward_claims',
    'face_verification_submissions'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Only attach if the table has a `status` column
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='status'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS tg_guard_terminal_status ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER tg_guard_terminal_status BEFORE UPDATE OF status ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tg_guard_terminal_status_change()',
        t
      );
    END IF;
  END LOOP;
END $$;