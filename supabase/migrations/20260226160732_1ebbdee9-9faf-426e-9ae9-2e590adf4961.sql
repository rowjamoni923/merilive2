
-- ATOMIC coin deduction for edge functions (service_role context, no auth.uid())
-- This function uses coins = coins - amount WHERE coins >= amount for true atomicity
CREATE OR REPLACE FUNCTION public.deduct_coins_atomic(
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_balance INTEGER;
  rows_affected INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Atomic deduction: only succeeds if coins >= p_amount
  UPDATE profiles
  SET coins = coins - p_amount
  WHERE id = p_user_id
    AND coins >= p_amount
  RETURNING coins INTO result_balance;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;

  IF rows_affected = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'new_balance', 0);
  ELSE
    RETURN jsonb_build_object('success', true, 'new_balance', result_balance);
  END IF;
END;
$$;

-- Grant execute to service_role (for edge functions)
GRANT EXECUTE ON FUNCTION public.deduct_coins_atomic(UUID, INTEGER) TO service_role;
-- Also grant to authenticated for potential direct use
GRANT EXECUTE ON FUNCTION public.deduct_coins_atomic(UUID, INTEGER) TO authenticated;
