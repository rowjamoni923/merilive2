
-- Create get_user_balance RPC that returns correct values
CREATE OR REPLACE FUNCTION public.get_user_balance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coins bigint;
  v_beans bigint;
  v_diamonds bigint;
BEGIN
  SELECT 
    COALESCE(coins, 0),
    COALESCE(beans, 0),
    COALESCE(diamonds, 0)
  INTO v_coins, v_beans, v_diamonds
  FROM profiles
  WHERE id = auth.uid();

  RETURN jsonb_build_object(
    'coins', v_coins,
    'beans', v_beans,
    'diamonds', v_diamonds
  );
END;
$$;
