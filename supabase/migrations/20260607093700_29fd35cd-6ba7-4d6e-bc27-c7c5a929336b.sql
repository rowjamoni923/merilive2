-- =========================================================================
-- Phase A: Fix game win not crediting diamonds instantly
-- =========================================================================
-- Drop all duplicate/buggy overloads and keep ONE canonical version each.
-- The broken overloads either (a) wrote to non-existent 'diamonds_balance'
-- column or (b) didn't set 'app.bypass_profile_protection' before UPDATE,
-- causing the protect_sensitive_profile_columns trigger to block the update
-- silently. Result: win RPC returned success:false, balance never credited.

-- ---- place_game_bet: drop all overloads ----
DROP FUNCTION IF EXISTS public.place_game_bet(uuid, bigint, text);
DROP FUNCTION IF EXISTS public.place_game_bet(uuid, integer, text);
DROP FUNCTION IF EXISTS public.place_game_bet(uuid, text, integer);
DROP FUNCTION IF EXISTS public.place_game_bet(uuid, integer, text, text);
DROP FUNCTION IF EXISTS public.place_game_bet(uuid, bigint, text, text);

-- ---- process_game_win: drop all overloads ----
DROP FUNCTION IF EXISTS public.process_game_win(uuid, bigint, text);
DROP FUNCTION IF EXISTS public.process_game_win(uuid, integer, text);
DROP FUNCTION IF EXISTS public.process_game_win(uuid, text, integer);
DROP FUNCTION IF EXISTS public.process_game_win(uuid, integer, text, text, numeric, boolean);
DROP FUNCTION IF EXISTS public.process_game_win(uuid, bigint, text, text, numeric, boolean);

-- ---- Recreate canonical place_game_bet (bigint, 4-arg) ----
CREATE OR REPLACE FUNCTION public.place_game_bet(
  p_user_id uuid,
  p_amount bigint,
  p_game_id text,
  p_game_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cur bigint;
  v_new bigint;
  v_amt bigint;
  v_label text;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  PERFORM set_config('app.calling_function', 'place_game_bet', true);

  v_amt := GREATEST(0, p_amount);
  IF v_amt <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid bet amount');
  END IF;

  v_label := NULLIF(trim(COALESCE(p_game_name, '')), '');
  IF v_label IS NULL THEN v_label := NULLIF(trim(COALESCE(p_game_id, '')), ''); END IF;
  IF v_label IS NULL THEN v_label := 'unknown'; END IF;

  SELECT coins INTO v_cur FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_cur IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  IF v_cur < v_amt THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient diamonds',
      'balance', v_cur,
      'current_balance', v_cur,
      'new_balance', v_cur
    );
  END IF;

  v_new := v_cur - v_amt;

  -- CRITICAL: bypass profile-protection trigger
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
    SET coins = v_new, updated_at = now()
    WHERE id = p_user_id;

  INSERT INTO public.game_transactions
    (user_id, game_type, transaction_type, amount, balance_before, balance_after)
  VALUES
    (p_user_id, v_label, 'bet', v_amt, v_cur, v_new);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new,
    'balance', v_new,
    'deducted', v_amt
  );
END;
$function$;

-- ---- Recreate canonical process_game_win (bigint, 6-arg) ----
CREATE OR REPLACE FUNCTION public.process_game_win(
  p_user_id uuid,
  p_amount bigint,
  p_game_id text,
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
  v_cur bigint;
  v_new bigint;
  v_amt bigint;
  v_label text;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session()
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  PERFORM set_config('app.calling_function', 'process_game_win', true);

  v_amt := GREATEST(0, p_amount);
  IF v_amt <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid win amount');
  END IF;

  v_label := NULLIF(trim(COALESCE(p_game_name, '')), '');
  IF v_label IS NULL THEN v_label := NULLIF(trim(COALESCE(p_game_id, '')), ''); END IF;
  IF v_label IS NULL THEN v_label := 'unknown'; END IF;

  SELECT coins INTO v_cur FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_cur IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  v_new := v_cur + v_amt;

  -- CRITICAL: bypass profile-protection trigger (this was missing in some overloads)
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
    SET coins = v_new, updated_at = now()
    WHERE id = p_user_id;

  INSERT INTO public.game_transactions
    (user_id, game_type, transaction_type, amount, balance_before, balance_after)
  VALUES
    (p_user_id, v_label, 'win', v_amt, v_cur, v_new);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new,
    'balance', v_new,
    'added', v_amt,
    'multiplier', p_multiplier,
    'is_jackpot', p_is_jackpot
  );
END;
$function$;

-- Grants
GRANT EXECUTE ON FUNCTION public.place_game_bet(uuid, bigint, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_game_win(uuid, bigint, text, text, numeric, boolean) TO authenticated, service_role;