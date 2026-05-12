-- ============================================================
-- 1. RPC: submit_manual_recharge_proof
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_manual_recharge_proof(
  p_order_id uuid,
  p_transaction_id text,
  p_proof_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.helper_orders%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF p_transaction_id IS NULL OR length(trim(p_transaction_id)) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'transaction_id_too_short');
  END IF;

  SELECT * INTO v_order FROM public.helper_orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_found');
  END IF;

  IF v_order.user_id IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  IF v_order.status NOT IN ('pending','gateway_pending','processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_pending', 'status', v_order.status);
  END IF;

  UPDATE public.helper_orders
  SET status = 'pending',
      user_payment_proof = COALESCE(p_proof_url, user_payment_proof),
      payment_details = COALESCE(payment_details, '{}'::jsonb) || jsonb_build_object(
        'transaction_id', trim(p_transaction_id),
        'user_transaction_id', trim(p_transaction_id),
        'manual_review_required', true,
        'manual_proof_submitted_at', now(),
        'verification_method', 'manual_user_proof'
      ),
      updated_at = now()
  WHERE id = p_order_id;

  -- Notify the helper assigned to the order
  IF v_order.helper_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    SELECT th.user_id,
           'helper_manual_order',
           '📝 Manual Review Order',
           'A user has submitted Transaction ID + screenshot for an order that auto-verification missed. Please review and approve.',
           jsonb_build_object('order_id', p_order_id, 'transaction_id', trim(p_transaction_id))
    FROM public.topup_helpers th
    WHERE th.id = v_order.helper_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'status', 'pending', 'order_id', p_order_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_manual_recharge_proof(uuid, text, text) TO authenticated;

-- ============================================================
-- 2. Storage policies for payment-proofs (private bucket)
--    Path layout: {user_id}/{order_id}-{ts}.{ext}
-- ============================================================
DROP POLICY IF EXISTS "User can upload own payment proof" ON storage.objects;
CREATE POLICY "User can upload own payment proof"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "User can read own payment proof" ON storage.objects;
CREATE POLICY "User can read own payment proof"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Helpers can read assigned order proofs" ON storage.objects;
CREATE POLICY "Helpers can read assigned order proofs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND EXISTS (
    SELECT 1 FROM public.helper_orders ho
    JOIN public.topup_helpers th ON th.id = ho.helper_id
    WHERE th.user_id = auth.uid()
      AND ho.user_payment_proof LIKE '%' || split_part(name, '/', 2) || '%'
  )
);