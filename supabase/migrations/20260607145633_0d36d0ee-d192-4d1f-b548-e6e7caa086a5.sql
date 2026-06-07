CREATE OR REPLACE FUNCTION public.process_game_win(
  p_user_id   uuid,
  p_amount    bigint,
  p_game_id   text,
  p_game_name text,
  p_multiplier numeric DEFAULT NULL,
  p_is_jackpot boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cur   bigint;
  v_new   bigint;
  v_amt   bigint;
  v_label text;
  v_uid   uuid;
  v_role  text;
BEGIN
  -- Resolve caller identity once (safe even when null).
  v_uid  := auth.uid();
  v_role := COALESCE(auth.role(), '');

  -- Authorization: allow self-credit, service_role, admin user, or admin panel session.
  IF v_role <> 'service_role'
     AND v_uid IS DISTINCT FROM p_user_id
     AND NOT public.is_admin(v_uid)
     AND NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  v_amt := GREATEST(0, COALESCE(p_amount, 0));
  IF v_amt <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid win amount');
  END IF;

  v_label := NULLIF(btrim(COALESCE(p_game_name, '')), '');
  IF v_label IS NULL THEN v_label := NULLIF(btrim(COALESCE(p_game_id, '')), ''); END IF;
  IF v_label IS NULL THEN v_label := 'unknown'; END IF;

  -- Mark provenance for audit + sensitive-column protection
  PERFORM set_config('app.calling_function',         'process_game_win', true);
  PERFORM set_config('app.bypass_profile_protection', 'true',            true);

  -- Lock & read current balance
  SELECT COALESCE(coins, 0) INTO v_cur
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_new := v_cur + v_amt;

  -- Credit the winnings
  UPDATE public.profiles
     SET coins = v_new,
         updated_at = now()
   WHERE id = p_user_id;

  -- Best-effort transaction log (NEVER fail the credit if logging hiccups).
  BEGIN
    INSERT INTO public.game_transactions
      (user_id, game_id, game_type, transaction_type,
       amount, bet_amount, win_amount, is_win,
       result_data, balance_before, balance_after)
    VALUES
      (p_user_id, COALESCE(p_game_id, v_label), v_label, 'win',
       v_amt, 0, v_amt, true,
       jsonb_build_object('multiplier', p_multiplier, 'is_jackpot', p_is_jackpot),
       v_cur, v_new);
  EXCEPTION WHEN OTHERS THEN
    -- Swallow logging error so the player still gets paid out.
    NULL;
  END;

  RETURN jsonb_build_object(
    'success',     true,
    'new_balance', v_new,
    'balance',     v_new,
    'added',       v_amt,
    'multiplier',  p_multiplier,
    'is_jackpot',  p_is_jackpot
  );

EXCEPTION WHEN OTHERS THEN
  -- Surface the actual SQL error to the client instead of crashing the txn.
  RETURN jsonb_build_object(
    'success', false,
    'error',   'process_game_win failed: ' || SQLERRM,
    'sqlstate', SQLSTATE
  );
END;
$function$;

-- Re-grant EXECUTE just in case proacl was scrubbed by an earlier migration.
GRANT EXECUTE ON FUNCTION public.process_game_win(uuid, bigint, text, text, numeric, boolean) TO authenticated, service_role;