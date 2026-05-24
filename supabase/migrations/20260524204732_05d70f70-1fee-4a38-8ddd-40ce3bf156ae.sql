
-- 1. place_live_game_bet: force auth.uid(), positive amount, valid round
CREATE OR REPLACE FUNCTION public.place_live_game_bet(
  p_round_id uuid,
  p_user_id uuid,
  p_bet_amount integer,
  p_bet_type text DEFAULT NULL,
  p_bet_value text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_round RECORD;
  v_coins integer;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  IF p_bet_amount IS NULL OR p_bet_amount <= 0 OR p_bet_amount > 1000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_amount');
  END IF;

  IF public.is_user_live_banned(v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'banned');
  END IF;

  SELECT id, status, betting_end_at, stream_id INTO v_round
  FROM public.live_game_rounds
  WHERE id = p_round_id
  FOR UPDATE;

  IF NOT FOUND OR v_round.status <> 'betting' OR (v_round.betting_end_at IS NOT NULL AND v_round.betting_end_at < now()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'round_not_open');
  END IF;

  -- prevent double-bet per round
  IF EXISTS (SELECT 1 FROM public.game_bets WHERE round_id = p_round_id AND user_id = v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_bet');
  END IF;

  SELECT coins INTO v_coins FROM public.profiles WHERE id = v_caller FOR UPDATE;
  IF COALESCE(v_coins, 0) < p_bet_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_coins');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET coins = coins - p_bet_amount WHERE id = v_caller;
  INSERT INTO public.game_bets (user_id, round_id, bet_amount, bet_type, bet_value, status)
  VALUES (v_caller, p_round_id, p_bet_amount, p_bet_type, p_bet_value, 'placed');
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  RETURN jsonb_build_object('success', true, 'new_balance', v_coins - p_bet_amount);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.place_live_game_bet(uuid, uuid, integer, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_live_game_bet(uuid, uuid, integer, text, text) TO authenticated;

-- 2. process_live_game_round: host-only or service/admin
CREATE OR REPLACE FUNCTION public.process_live_game_round(
  p_round_id uuid,
  p_winning_value text,
  p_result text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  bet RECORD;
  winners integer := 0;
  total_payout bigint := 0;
  v_caller uuid := auth.uid();
  v_stream_id uuid;
  v_host_id uuid;
  v_status text;
BEGIN
  SELECT r.stream_id, r.status, ls.host_id
    INTO v_stream_id, v_status, v_host_id
  FROM public.live_game_rounds r
  LEFT JOIN public.live_streams ls ON ls.id = r.stream_id
  WHERE r.id = p_round_id
  FOR UPDATE;

  IF v_stream_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'round_not_found');
  END IF;

  IF v_status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_processed');
  END IF;

  IF current_setting('request.jwt.claim.role', true) <> 'service_role'
     AND NOT public.is_active_admin_session()
     AND (v_caller IS NULL OR v_caller <> v_host_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  UPDATE public.live_game_rounds
  SET status = 'completed', winning_value = p_winning_value, result = p_result, ended_at = now()
  WHERE id = p_round_id;

  FOR bet IN SELECT * FROM public.game_bets WHERE round_id = p_round_id AND status = 'placed' LOOP
    IF bet.bet_value = p_winning_value THEN
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE public.profiles SET coins = coins + (bet.bet_amount * 2) WHERE id = bet.user_id;
      UPDATE public.game_bets SET status = 'won', win_amount = bet.bet_amount * 2 WHERE id = bet.id;
      winners := winners + 1;
      total_payout := total_payout + (bet.bet_amount * 2);
    ELSE
      UPDATE public.game_bets SET status = 'lost', win_amount = 0 WHERE id = bet.id;
    END IF;
  END LOOP;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  RETURN jsonb_build_object('success', true, 'winners', winners, 'total_payout', total_payout);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.process_live_game_round(uuid, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_live_game_round(uuid, text, text) TO authenticated;

-- 3. create_live_game_round: tighten inputs
CREATE OR REPLACE FUNCTION public.create_live_game_round(
  _game_type text,
  _stream_id uuid,
  _betting_time integer DEFAULT 30
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _round_id uuid;
  _host_id uuid;
  _bt int := COALESCE(_betting_time, 30);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF _game_type IS NULL OR _game_type NOT IN ('dice','wheel','color','number','cards') THEN
    RAISE EXCEPTION 'invalid game_type';
  END IF;
  IF _bt < 5 OR _bt > 300 THEN
    RAISE EXCEPTION 'invalid betting_time';
  END IF;

  SELECT host_id INTO _host_id FROM public.live_streams WHERE id = _stream_id AND is_active = true;
  IF _host_id IS NULL OR _host_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only stream host can create game rounds';
  END IF;
  IF EXISTS (SELECT 1 FROM public.live_game_rounds WHERE stream_id = _stream_id AND status IN ('betting','playing')) THEN
    RAISE EXCEPTION 'Active round already exists';
  END IF;
  INSERT INTO public.live_game_rounds (stream_id, game_type, status, betting_end_at)
  VALUES (_stream_id, _game_type, 'betting', now() + (_bt || ' seconds')::interval)
  RETURNING id INTO _round_id;
  RETURN _round_id;
END;
$function$;

-- 4. stream_viewers SELECT privacy: hide viewer list on non-public streams
DROP POLICY IF EXISTS "Anyone can view stream viewers" ON public.stream_viewers;

CREATE POLICY "View stream viewers respecting privacy"
ON public.stream_viewers
FOR SELECT
USING (
  viewer_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.live_streams ls
    WHERE ls.id = stream_viewers.stream_id
      AND (
        COALESCE(ls.live_privacy, 'public') = 'public'
        OR ls.host_id = auth.uid()
      )
  )
  OR public.is_active_admin_session()
);
