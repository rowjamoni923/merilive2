
ALTER TABLE public.swift_pay_topups
  ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'user_diamond',
  ADD COLUMN IF NOT EXISTS target_helper_id uuid REFERENCES public.topup_helpers(id) ON DELETE SET NULL;

ALTER TABLE public.swift_pay_topups
  DROP CONSTRAINT IF EXISTS swift_pay_topups_target_type_check;
ALTER TABLE public.swift_pay_topups
  ADD CONSTRAINT swift_pay_topups_target_type_check
  CHECK (target_type IN ('user_diamond','helper_wallet'));

CREATE INDEX IF NOT EXISTS idx_swift_pay_topups_target_helper
  ON public.swift_pay_topups(target_helper_id) WHERE target_helper_id IS NOT NULL;

-- RPC to atomically credit a helper's trader wallet from edge function
CREATE OR REPLACE FUNCTION public.credit_helper_wallet_from_swift_pay(
  p_helper_id uuid,
  p_diamonds numeric,
  p_topup_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance numeric;
  v_already_credited boolean;
BEGIN
  -- Idempotency: only credit if this swift_pay_topups row is not already 'credited'
  SELECT (status = 'credited') INTO v_already_credited
    FROM swift_pay_topups WHERE id = p_topup_id;
  IF COALESCE(v_already_credited, false) THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'already_credited');
  END IF;

  UPDATE topup_helpers
    SET wallet_balance = COALESCE(wallet_balance, 0) + p_diamonds,
        total_bought  = COALESCE(total_bought, 0)  + p_diamonds::bigint,
        updated_at = now()
    WHERE id = p_helper_id
    RETURNING wallet_balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'helper_not_found %', p_helper_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'new_wallet_balance', v_new_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.credit_helper_wallet_from_swift_pay(uuid, numeric, uuid) FROM public, anon, authenticated;
