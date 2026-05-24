-- Pass-5 Recharge audit — fix RLS gaps on helper_orders.
--
-- Current state: only admins + helpers have any policy. Normal users have NO
-- INSERT, NO SELECT, NO UPDATE — meaning client-side `supabase.from('helper_orders').insert(...)`
-- and the pass-4 pending→completed promotion both fail silently under user JWT.
-- We add minimal, narrowly-scoped policies for the order owner and route any
-- status mutation through a SECURITY DEFINER RPC so the user can never set
-- privileged fields (coin_amount, helper_id, payment_details.transaction_id, …).

-- 1) Allow user to insert their own helper_orders rows. WITH CHECK enforces ownership.
DROP POLICY IF EXISTS "users_insert_own_helper_orders" ON public.helper_orders;
CREATE POLICY "users_insert_own_helper_orders"
  ON public.helper_orders FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 2) Allow user to read back ONLY their own orders.
DROP POLICY IF EXISTS "users_select_own_helper_orders" ON public.helper_orders;
CREATE POLICY "users_select_own_helper_orders"
  ON public.helper_orders FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 3) Harden existing helper UPDATE so they cannot reassign helper_id or user_id.
DROP POLICY IF EXISTS "helper_update_own_orders" ON public.helper_orders;
CREATE POLICY "helper_update_own_orders"
  ON public.helper_orders FOR UPDATE TO authenticated
  USING (
    helper_id IN (SELECT id FROM topup_helpers WHERE user_id = auth.uid())
  )
  WITH CHECK (
    helper_id IN (SELECT id FROM topup_helpers WHERE user_id = auth.uid())
  );

-- 4) SECURITY DEFINER RPC: only the order owner can call this, and only to
-- finalize a 'pending' order to 'completed' / 'failed'. We never let the
-- caller change coin_amount, helper_id, payment_method, etc.
CREATE OR REPLACE FUNCTION public.user_finalize_helper_order(
  _order_id UUID,
  _new_status TEXT,
  _reason TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.helper_orders%ROWTYPE;
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authenticated');
  END IF;

  IF _new_status NOT IN ('completed', 'failed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid status');
  END IF;

  SELECT * INTO v_order FROM public.helper_orders WHERE id = _order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'order not found');
  END IF;
  IF v_order.user_id <> v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;
  -- Only finalize rows that are still pending; never reopen completed/failed.
  IF v_order.status <> 'pending' THEN
    RETURN jsonb_build_object('success', true, 'already', v_order.status);
  END IF;

  IF _new_status = 'completed' THEN
    UPDATE public.helper_orders
       SET status = 'completed', processed_at = now()
     WHERE id = _order_id;
  ELSE
    UPDATE public.helper_orders
       SET status = 'failed',
           payment_details = COALESCE(payment_details, '{}'::jsonb)
                             || jsonb_build_object(
                                  'failure_reason', COALESCE(_reason, 'unknown'),
                                  'needs_reconciliation', true
                                )
     WHERE id = _order_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', _new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.user_finalize_helper_order(UUID, TEXT, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.user_finalize_helper_order(UUID, TEXT, TEXT) TO authenticated;