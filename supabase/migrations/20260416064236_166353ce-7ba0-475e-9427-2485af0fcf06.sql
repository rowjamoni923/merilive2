-- 1) Storage policies for agency/helper payment proof uploads
CREATE POLICY "Helpers can upload payment proofs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.user_id = auth.uid()
      AND th.is_active = true
      AND th.is_verified = true
  )
);

CREATE POLICY "Helpers can upload withdrawal proofs in avatars"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = 'withdrawal-proofs'
  AND EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.user_id = auth.uid()
      AND th.is_active = true
      AND th.is_verified = true
  )
);

-- 2) Replace broken helper update policy for agency withdrawals with explicit WITH CHECK
DROP POLICY IF EXISTS "Level 5 helpers can update agency withdrawals" ON public.agency_withdrawals;

CREATE POLICY "Level 5 helpers can update agency withdrawals"
ON public.agency_withdrawals
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
      AND th.is_verified = true
  )
  AND (
    status = 'pending'
    OR assigned_helper_id IN (
      SELECT th.id
      FROM public.topup_helpers th
      WHERE th.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = agency_withdrawals.assigned_helper_id
      AND th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
      AND th.is_verified = true
  )
  AND status = 'processing'
);

-- 3) Safe RPC for processing agency withdrawals without touching missing columns
CREATE OR REPLACE FUNCTION public.helper_process_agency_withdrawal(
  _withdrawal_id uuid,
  _helper_id uuid,
  _screenshot_url text,
  _transaction_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _current record;
  _payment_details jsonb;
  _net_withdrawal_beans numeric;
  _diamond_reward numeric;
BEGIN
  SELECT * INTO _current
  FROM public.agency_withdrawals
  WHERE id = _withdrawal_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF _current.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal already claimed or processed');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = _helper_id
      AND th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
      AND th.is_verified = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized helper');
  END IF;

  _net_withdrawal_beans := COALESCE((_current.payment_details->>'net_withdrawal_beans')::numeric, _current.amount);
  _diamond_reward := ROUND(_net_withdrawal_beans);
  _payment_details := COALESCE(_current.payment_details, '{}'::jsonb) || jsonb_build_object(
    'helper_payment_screenshot', _screenshot_url,
    'helper_transaction_id', _transaction_note,
    'helper_notes', _transaction_note,
    'diamond_reward', _diamond_reward,
    'helper_processed_at', now(),
    'processed_by_helper_id', _helper_id
  );

  UPDATE public.agency_withdrawals
  SET status = 'processing',
      assigned_helper_id = _helper_id,
      helper_processed_at = now(),
      payment_details = _payment_details
  WHERE id = _withdrawal_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal could not be updated');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'withdrawal_id', _withdrawal_id,
    'diamond_reward', _diamond_reward
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.helper_process_agency_withdrawal(uuid, uuid, text, text) TO authenticated;