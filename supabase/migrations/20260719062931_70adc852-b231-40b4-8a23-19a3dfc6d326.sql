-- DU-2B batch 2/4: Gift + Play/recharge credit RPCs -> diamonds
BEGIN;

-- ---- _apply_recharge_bonuses_internal ----
CREATE OR REPLACE FUNCTION public._apply_recharge_bonuses_internal(p_user_id uuid, p_base_coins integer, p_recharge_ref text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_bonus public.first_recharge_bonus%ROWTYPE;
  v_first_bonus_amount integer := 0;
  v_first_already boolean := false;
  v_vip_result jsonb;
  v_recharge_uuid uuid;
BEGIN
  IF p_user_id IS NULL OR COALESCE(p_base_coins, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
  END IF;
  SELECT * INTO v_bonus FROM public.first_recharge_bonus
   WHERE COALESCE(is_active, true) = true
   ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST LIMIT 1;
  IF FOUND THEN
    BEGIN
      IF COALESCE(v_bonus.bonus_coins, 0) > 0 THEN
        v_first_bonus_amount := v_bonus.bonus_coins;
      ELSIF COALESCE(v_bonus.bonus_multiplier, 0) > 0 THEN
        v_first_bonus_amount := FLOOR(p_base_coins::numeric * v_bonus.bonus_multiplier)::integer;
      ELSIF COALESCE(v_bonus.bonus_percentage, 0) > 0 THEN
        v_first_bonus_amount := FLOOR(p_base_coins::numeric * v_bonus.bonus_percentage / 100.0)::integer;
      END IF;
      IF v_first_bonus_amount > 0 THEN
        INSERT INTO public.first_recharge_claims (user_id, bonus_id, original_amount, bonus_amount)
        VALUES (p_user_id, v_bonus.id, p_base_coins, v_first_bonus_amount);
        PERFORM set_config('app.bypass_profile_protection', 'true', true);
        UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + v_first_bonus_amount, updated_at = now()
         WHERE id = p_user_id;
      END IF;
    EXCEPTION WHEN unique_violation THEN
      v_first_already := true;
      v_first_bonus_amount := 0;
    END;
  END IF;
  BEGIN v_recharge_uuid := p_recharge_ref::uuid; EXCEPTION WHEN OTHERS THEN v_recharge_uuid := NULL; END;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  v_vip_result := public.apply_vip_recharge_bonus(p_user_id, v_recharge_uuid, p_base_coins);
  RETURN jsonb_build_object('success', true, 'first_recharge_bonus_coins', v_first_bonus_amount,
    'first_recharge_already', v_first_already, 'vip_bonus', v_vip_result);
END; $function$;


-- ---- apply_vip_recharge_bonus ----
CREATE OR REPLACE FUNCTION public.apply_vip_recharge_bonus(_user_id uuid, _recharge_id uuid, _base_diamonds integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _vip_pct NUMERIC := 0; _noble_pct NUMERIC := 0; _final_pct NUMERIC := 0;
  _bonus INTEGER := 0; _vip_id UUID; _noble_id UUID;
  _source_type TEXT; _source_id UUID;
  _caller_role TEXT := current_setting('request.jwt.claim.role', true);
  _is_trusted_internal boolean := COALESCE(current_setting('app.bypass_profile_protection', true), 'false') = 'true';
BEGIN
  IF _caller_role IS DISTINCT FROM 'service_role' AND NOT _is_trusted_internal THEN
    RAISE EXCEPTION 'apply_vip_recharge_bonus: forbidden' USING ERRCODE = '42501';
  END IF;
  IF _user_id IS NULL OR _base_diamonds IS NULL OR _base_diamonds <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid input');
  END IF;
  SELECT vt.id, vt.recharge_bonus_percent INTO _vip_id, _vip_pct
    FROM public.user_vip_subscriptions uvs JOIN public.vip_tiers vt ON vt.id = uvs.vip_tier_id
   WHERE uvs.user_id = _user_id AND uvs.is_active = true
     AND (uvs.expires_at IS NULL OR uvs.expires_at > now())
     AND vt.recharge_bonus_percent > 0
   ORDER BY vt.recharge_bonus_percent DESC LIMIT 1;
  SELECT nc.id, nc.recharge_bonus_percent INTO _noble_id, _noble_pct
    FROM public.user_noble_subscriptions uns JOIN public.noble_cards nc ON nc.id = uns.noble_card_id
   WHERE uns.user_id = _user_id AND uns.is_active = true AND uns.expires_at > now()
     AND nc.recharge_bonus_percent > 0
   ORDER BY nc.recharge_bonus_percent DESC LIMIT 1;
  IF COALESCE(_noble_pct, 0) >= COALESCE(_vip_pct, 0) THEN
    _final_pct := COALESCE(_noble_pct, 0); _source_type := 'noble_card'; _source_id := _noble_id;
  ELSE
    _final_pct := COALESCE(_vip_pct, 0); _source_type := 'vip_tier'; _source_id := _vip_id;
  END IF;
  IF _final_pct <= 0 THEN
    RETURN jsonb_build_object('success', true, 'bonus_diamonds', 0, 'reason', 'No bonus eligible');
  END IF;
  _bonus := FLOOR(_base_diamonds * _final_pct / 100.0);
  IF _bonus > 0 THEN
    BEGIN
      INSERT INTO public.vip_recharge_bonus_log (user_id, recharge_id, base_diamonds, bonus_percent,
        bonus_diamonds, source_type, source_id)
      VALUES (_user_id, _recharge_id, _base_diamonds, _final_pct, _bonus, _source_type, _source_id);
    EXCEPTION WHEN unique_violation THEN
      RETURN jsonb_build_object('success', true, 'already_applied', true, 'bonus_diamonds', 0,
        'bonus_percent', _final_pct, 'source_type', _source_type);
    END;
    PERFORM set_config('app.wallet_ctx', jsonb_build_object('source_type', 'vip_recharge_bonus',
      'source_id', COALESCE(_recharge_id::text, _source_id::text, ''),
      'source_table', 'vip_recharge_bonus_log', 'payment_method', 'recharge_bonus',
      'payment_reference', COALESCE(_recharge_id::text, _source_id::text, ''),
      'vip_bonus_source_type', _source_type, 'vip_bonus_percent', _final_pct,
      'base_diamonds', _base_diamonds)::text, true);
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + _bonus, updated_at = now()
    WHERE id = _user_id;
  END IF;
  RETURN jsonb_build_object('success', true, 'bonus_diamonds', _bonus, 'bonus_percent', _final_pct,
    'source_type', _source_type);
END; $function$;


-- ---- claim_first_recharge_bonus_and_credit ----
CREATE OR REPLACE FUNCTION public.claim_first_recharge_bonus_and_credit(_user_id uuid, _bonus_id uuid, _original_amount integer, _bonus_amount integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_bonus public.first_recharge_bonus%ROWTYPE;
  v_calc_amount integer;
  v_new_balance integer;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  IF _bonus_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'missing_bonus_id'); END IF;
  IF COALESCE(_original_amount, 0) <= 0 OR _original_amount > 100000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_original_amount');
  END IF;
  _user_id := v_uid;
  SELECT * INTO v_bonus FROM public.first_recharge_bonus
   WHERE id = _bonus_id AND COALESCE(is_active, true) = true LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'bonus_not_found_or_inactive');
  END IF;
  IF COALESCE(v_bonus.bonus_coins, 0) > 0 THEN
    v_calc_amount := v_bonus.bonus_coins;
  ELSIF COALESCE(v_bonus.bonus_multiplier, 0) > 0 THEN
    v_calc_amount := FLOOR(_original_amount::numeric * v_bonus.bonus_multiplier)::integer;
  ELSIF COALESCE(v_bonus.bonus_percentage, 0) > 0 THEN
    v_calc_amount := FLOOR(_original_amount::numeric * v_bonus.bonus_percentage / 100.0)::integer;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'bonus_amount_not_configured');
  END IF;
  IF v_calc_amount <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'computed_bonus_zero'); END IF;
  INSERT INTO public.first_recharge_claims (user_id, bonus_id, original_amount, bonus_amount)
  VALUES (_user_id, _bonus_id, _original_amount, v_calc_amount);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + v_calc_amount, updated_at = now()
  WHERE id = _user_id RETURNING diamonds INTO v_new_balance;
  IF NOT FOUND THEN
    DELETE FROM public.first_recharge_claims WHERE user_id = _user_id AND bonus_id = _bonus_id;
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;
  RETURN jsonb_build_object('success', true, 'bonus_amount', v_calc_amount, 'new_balance', v_new_balance);
EXCEPTION WHEN unique_violation THEN
  SELECT COALESCE(diamonds, 0) INTO v_new_balance FROM public.profiles WHERE id = _user_id;
  RETURN jsonb_build_object('success', true, 'already_claimed', true, 'bonus_amount', 0, 'new_balance', COALESCE(v_new_balance, 0));
END; $function$;


-- ---- pk_battle_send_gift ----
CREATE OR REPLACE FUNCTION public.pk_battle_send_gift(_battle_id uuid, _target_host_id uuid, _gift_id uuid, _quantity integer DEFAULT 1)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _me uuid := auth.uid(); _battle public.pk_battles;
        _gift_coins bigint; _total_cost bigint; _user_coins bigint;
        _score_value bigint; _phase text;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF _quantity < 1 OR _quantity > 9999 THEN RAISE EXCEPTION 'invalid quantity'; END IF;
  SELECT * INTO _battle FROM public.pk_battles WHERE id=_battle_id FOR UPDATE;
  IF _battle.id IS NULL THEN RAISE EXCEPTION 'battle not found'; END IF;
  IF _battle.status NOT IN ('active','punishment') THEN
    RAISE EXCEPTION 'battle not accepting gifts (status=%)', _battle.status;
  END IF;
  IF _target_host_id NOT IN (_battle.host1_id, _battle.host2_id) THEN
    RAISE EXCEPTION 'target is not a battle host';
  END IF;
  _phase := CASE WHEN _battle.status='punishment' THEN 'punishment' ELSE 'main' END;
  SELECT COALESCE(coin_cost,0) INTO _gift_coins FROM public.gifts WHERE id=_gift_id;
  IF _gift_coins IS NULL OR _gift_coins <= 0 THEN RAISE EXCEPTION 'invalid gift'; END IF;
  _total_cost := _gift_coins * _quantity;
  _score_value := _total_cost;
  SELECT diamonds INTO _user_coins FROM public.profiles WHERE id=_me FOR UPDATE;
  IF _user_coins IS NULL OR _user_coins < _total_cost THEN
    RAISE EXCEPTION 'insufficient coins (need %, have %)', _total_cost, COALESCE(_user_coins,0);
  END IF;
  UPDATE public.profiles SET diamonds=diamonds-_total_cost WHERE id=_me;
  INSERT INTO public.pk_battle_gifts (battle_id, sender_id, target_host_id, gift_id, coin_amount, score_value, phase)
  VALUES (_battle_id, _me, _target_host_id, _gift_id, _total_cost, _score_value, _phase);
  IF _phase = 'main' THEN
    IF _target_host_id = _battle.host1_id THEN
      UPDATE public.pk_battles SET host1_score=host1_score+_score_value, total_gift_value=total_gift_value+_total_cost, updated_at=now() WHERE id=_battle_id;
    ELSE
      UPDATE public.pk_battles SET host2_score=host2_score+_score_value, total_gift_value=total_gift_value+_total_cost, updated_at=now() WHERE id=_battle_id;
    END IF;
  ELSE
    UPDATE public.pk_battles SET total_gift_value=total_gift_value+_total_cost, updated_at=now() WHERE id=_battle_id;
  END IF;
  RETURN jsonb_build_object('ok',true,'phase',_phase,'score_added',_score_value,
    'coins_spent',_total_cost,'remaining_coins',_user_coins-_total_cost);
END; $function$;


-- ---- process_gift_transaction ----
CREATE OR REPLACE FUNCTION public.process_gift_transaction(p_sender_id uuid, p_receiver_id uuid, p_gift_id uuid, p_quantity integer DEFAULT 1, p_stream_id uuid DEFAULT NULL::uuid, p_party_room_id uuid DEFAULT NULL::uuid, p_call_id uuid DEFAULT NULL::uuid, p_reel_id uuid DEFAULT NULL::uuid, p_idempotency_key text DEFAULT NULL::text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _gift RECORD; _total_cost bigint; _new_sender_balance bigint;
  _beans_amount bigint := 0; _credit_percent numeric;
  _transaction_id uuid; _qty integer; _context_count integer;
  _sender RECORD; _receiver RECORD; _blocked_exists boolean;
  _existing RECORD; _idem text; _first_id uuid; _second_id uuid;
  _is_lucky boolean := false; _diamond_bonus bigint := 0; _unit_bonus bigint;
  _roll numeric; _cum numeric; _cfg RECORD; _has_cfg boolean := false;
  _i integer; _effective_level integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_sender_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized sender');
  END IF;
  IF p_sender_id IS NULL OR p_receiver_id IS NULL OR p_gift_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Missing required arguments');
  END IF;
  IF p_sender_id = p_receiver_id THEN
    RETURN json_build_object('success', false, 'error', 'Cannot send gift to self');
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 999 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid gift quantity');
  END IF;
  _qty := p_quantity;
  PERFORM set_config('app.calling_function', 'process_gift_transaction', true);
  _idem := NULLIF(trim(COALESCE(p_idempotency_key, '')), '');
  IF _idem IS NOT NULL THEN
    SELECT id, sender_id, coin_amount, receiver_beans INTO _existing
      FROM public.gift_transactions WHERE idempotency_key = _idem;
    IF FOUND THEN
      IF _existing.sender_id IS DISTINCT FROM p_sender_id THEN
        RETURN json_build_object('success', false, 'error', 'Idempotency key conflict');
      END IF;
      RETURN json_build_object('success', true, 'transaction_id', _existing.id,
        'total_cost', _existing.coin_amount, 'beans_received', _existing.receiver_beans,
        'idempotent_replay', true);
    END IF;
  END IF;
  _context_count :=
    (CASE WHEN p_stream_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN p_party_room_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN p_call_id IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN p_reel_id IS NULL THEN 0 ELSE 1 END);
  IF _context_count > 1 THEN
    RETURN json_build_object('success', false, 'error', 'Only one gift context is allowed');
  END IF;
  IF p_sender_id < p_receiver_id THEN
    _first_id := p_sender_id; _second_id := p_receiver_id;
  ELSE
    _first_id := p_receiver_id; _second_id := p_sender_id;
  END IF;
  PERFORM 1 FROM public.profiles WHERE id = _first_id  FOR UPDATE;
  PERFORM 1 FROM public.profiles WHERE id = _second_id FOR UPDATE;
  SELECT id, COALESCE(diamonds, 0)::bigint AS diamonds,
         GREATEST(
           COALESCE(user_level, 1),
           COALESCE(max_user_level, 1),
           COALESCE((
             SELECT MAX(level_number) FROM public.user_level_tiers t
             WHERE COALESCE(t.tier_type, 'user') = 'user'
               AND COALESCE(t.is_active, true) = true
               AND COALESCE(t.min_topup_amount, 0) <= COALESCE(p.total_recharged, 0)
           ), 1)
         )::integer AS user_level,
         COALESCE(is_blocked, false) AS is_blocked,
         COALESCE(is_banned, false) AS is_banned,
         COALESCE(is_deleted, false) AS is_deleted
    INTO _sender FROM public.profiles p WHERE id = p_sender_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Sender not found'); END IF;
  IF _sender.is_blocked OR _sender.is_banned OR _sender.is_deleted THEN
    RETURN json_build_object('success', false, 'error', 'Your account cannot send gifts');
  END IF;
  SELECT id, COALESCE(is_blocked, false) AS is_blocked,
         COALESCE(is_banned, false) AS is_banned,
         COALESCE(is_deleted, false) AS is_deleted
    INTO _receiver FROM public.profiles WHERE id = p_receiver_id;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Receiver not found'); END IF;
  IF _receiver.is_blocked OR _receiver.is_banned OR _receiver.is_deleted THEN
    RETURN json_build_object('success', false, 'error', 'Recipient is not available');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_users
    WHERE (blocker_id = p_sender_id AND blocked_id = p_receiver_id)
       OR (blocker_id = p_receiver_id AND blocked_id = p_sender_id)
  ) INTO _blocked_exists;
  IF _blocked_exists THEN
    RETURN json_build_object('success', false, 'error', 'Cannot send gift due to block');
  END IF;
  SELECT id, name, coin_value::bigint AS coin_value, icon_url, animation_url,
         COALESCE(receiver_beans, 0)::bigint AS receiver_beans,
         COALESCE(min_level, 0)::integer AS min_level,
         COALESCE(is_lucky, false) AS is_lucky
    INTO _gift FROM public.gifts
    WHERE id = p_gift_id AND COALESCE(is_active, true) = true FOR SHARE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'Gift not found'); END IF;
  _is_lucky := _gift.is_lucky;
  _effective_level := _sender.user_level;
  IF _gift.min_level > 0 AND _effective_level < _gift.min_level THEN
    RETURN json_build_object('success', false,
      'error', 'Requires Lv.' || _gift.min_level || ' to send this gift (you are Lv.' || _effective_level || ')',
      'required_level', _gift.min_level, 'current_level', _effective_level);
  END IF;
  IF _gift.coin_value IS NULL OR _gift.coin_value <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid gift price');
  END IF;
  IF _gift.receiver_beans < 0 OR _gift.receiver_beans > _gift.coin_value THEN
    RETURN json_build_object('success', false, 'error', 'Invalid gift payout');
  END IF;
  _total_cost := _gift.coin_value * _qty;
  IF _total_cost <= 0 THEN RETURN json_build_object('success', false, 'error', 'Invalid gift total'); END IF;
  IF _sender.diamonds < _total_cost THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient diamonds');
  END IF;
  IF p_stream_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.live_streams ls
    WHERE ls.id = p_stream_id AND ls.host_id = p_receiver_id
      AND COALESCE(ls.is_active, true) = true
      AND COALESCE(ls.status, 'active') NOT IN ('ended', 'finished', 'terminated', 'cancelled')
      AND ls.ended_at IS NULL
  ) THEN RETURN json_build_object('success', false, 'error', 'Invalid live gift target'); END IF;
  IF p_party_room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.party_rooms pr
    WHERE pr.id = p_party_room_id AND pr.host_id = p_receiver_id
      AND COALESCE(pr.is_active, true) = true AND pr.ended_at IS NULL
  ) THEN RETURN json_build_object('success', false, 'error', 'Invalid party gift target'); END IF;
  IF p_call_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.private_calls pc
    WHERE pc.id = p_call_id
      AND p_sender_id IN (pc.caller_id, pc.host_id)
      AND p_receiver_id IN (pc.caller_id, pc.host_id)
      AND p_sender_id <> p_receiver_id
      AND COALESCE(pc.status, 'active') NOT IN ('ended', 'cancelled', 'rejected', 'missed', 'failed')
  ) THEN RETURN json_build_object('success', false, 'error', 'Invalid call gift target'); END IF;
  IF p_reel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.reels r WHERE r.id = p_reel_id AND r.user_id = p_receiver_id
  ) THEN RETURN json_build_object('success', false, 'error', 'Invalid reel gift target'); END IF;
  IF _gift.receiver_beans > 0 THEN
    _beans_amount := _gift.receiver_beans * _qty;
    _credit_percent := NULL;
  ELSE
    _credit_percent := public.get_effective_host_percent();
    IF _credit_percent IS NULL OR _credit_percent < 0 OR _credit_percent > 100 THEN
      RETURN json_build_object('success', false,
        'error', 'Gift commission is not configured. Admin must set gift_commission.host_percent.');
    END IF;
    _beans_amount := FLOOR(_total_cost::numeric * _credit_percent / 100)::bigint;
  END IF;
  IF _beans_amount < 0 OR _beans_amount > _total_cost THEN
    RETURN json_build_object('success', false, 'error', 'Invalid computed gift payout');
  END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  _new_sender_balance := _sender.diamonds - _total_cost;
  UPDATE public.profiles
     SET diamonds = _new_sender_balance,
         total_consumption = COALESCE(total_consumption, 0) + _total_cost
   WHERE id = p_sender_id;
  IF _beans_amount > 0 THEN
    UPDATE public.profiles
       SET beans = COALESCE(beans, 0) + _beans_amount,
           total_earnings = COALESCE(total_earnings, 0) + _beans_amount,
           weekly_earnings = COALESCE(weekly_earnings, 0) + _beans_amount,
           pending_earnings = COALESCE(pending_earnings, 0) + _beans_amount
     WHERE id = p_receiver_id;
  END IF;
  BEGIN
    INSERT INTO public.gift_transactions (
      sender_id, receiver_id, gift_id, quantity,
      coin_amount, total_coins, coin_cost, coin_value, diamond_cost,
      receiver_beans, stream_id, party_room_id, call_id, reel_id, idempotency_key, created_at
    ) SELECT
      p_sender_id, p_receiver_id, p_gift_id, _qty,
      _total_cost, _total_cost, _total_cost, _gift.coin_value, _total_cost,
      _beans_amount, p_stream_id, p_party_room_id, p_call_id, p_reel_id, _idem, now()
    RETURNING id INTO _transaction_id;
  EXCEPTION WHEN OTHERS THEN RAISE; END;
  RETURN json_build_object('success', true, 'transaction_id', _transaction_id,
    'total_cost', _total_cost, 'beans_received', _beans_amount,
    'new_sender_balance', _new_sender_balance, 'host_percent', _credit_percent,
    'is_lucky', _is_lucky, 'diamond_bonus', _diamond_bonus);
END; $function$;


-- ---- process_google_play_purchase ----
CREATE OR REPLACE FUNCTION public.process_google_play_purchase(p_user_id uuid, p_product_id text, p_purchase_token text, p_google_order_id text DEFAULT NULL::text, p_google_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_pkg record; v_existing record;
  v_balance_before bigint; v_balance_after bigint;
  v_order_id text; v_notes text; v_requested_product text;
  v_payment_ref text; v_invite_result jsonb;
  v_bonus_result jsonb := NULL; v_recharge_id uuid;
BEGIN
  v_requested_product := trim(COALESCE(p_product_id, ''));
  IF p_user_id IS NULL OR v_requested_product = '' OR p_purchase_token IS NULL OR trim(p_purchase_token) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_required_fields');
  END IF;
  SELECT cp.id, cp.product_id, cp.coins_amount, COALESCE(cp.bonus_coins, 0) AS bonus_coins,
         (cp.coins_amount + COALESCE(cp.bonus_coins, 0)) AS total_coins, cp.price_usd
    INTO v_pkg FROM public.coin_packages cp
   WHERE cp.is_active = true
     AND lower(v_requested_product) IN (
       lower(trim(COALESCE(cp.product_id, ''))),
       lower('diamonds_' || cp.coins_amount::text),
       lower('coins_' || cp.coins_amount::text),
       lower('diamonds_' || (cp.coins_amount + COALESCE(cp.bonus_coins, 0))::text),
       lower('coins_' || (cp.coins_amount + COALESCE(cp.bonus_coins, 0))::text)
     ) LIMIT 1;
  IF v_pkg IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'invalid_product_id'); END IF;
  v_order_id := NULLIF(trim(COALESCE(p_google_order_id, '')), '');
  SELECT id, user_id, coins_received, google_order_id, transaction_id INTO v_existing
    FROM public.recharge_transactions
   WHERE payment_method = 'google_play'
     AND (transaction_id = p_purchase_token OR (v_order_id IS NOT NULL AND google_order_id = v_order_id))
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    SELECT COALESCE(diamonds, 0) INTO v_balance_after FROM public.profiles WHERE id = p_user_id;
    IF v_existing.user_id = p_user_id THEN
      v_invite_result := public.qualify_invitation_after_purchase(p_user_id, v_pkg.price_usd, v_pkg.total_coins, 'google_play', COALESCE(v_order_id, p_purchase_token));
      RETURN jsonb_build_object('success', true, 'alreadyProcessed', true, 'coins', COALESCE(v_existing.coins_received, v_pkg.total_coins), 'newBalance', COALESCE(v_balance_after, 0), 'transactionId', v_existing.id, 'invitation', v_invite_result);
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'purchase_token_already_used');
  END IF;
  SELECT COALESCE(diamonds, 0) INTO v_balance_before FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_balance_before IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'user_not_found'); END IF;
  v_notes := 'Server-verified Google Play purchase. Product: ' || v_requested_product || '. Order: ' || COALESCE(v_order_id, 'N/A');
  INSERT INTO public.recharge_transactions (
    user_id, order_id, payment_method, amount, coins_amount, bonus_coins,
    status, processed_at, created_at, updated_at, currency, usd_amount,
    coins_received, completed_at, currency_code, google_order_id,
    google_product_id, notes, purchase_source, transaction_id
  ) VALUES (
    p_user_id, v_order_id, 'google_play', v_pkg.price_usd, v_pkg.total_coins, v_pkg.bonus_coins,
    'completed', now(), now(), now(), 'USD', v_pkg.price_usd,
    v_pkg.total_coins, now(), 'USD', v_order_id,
    v_requested_product, v_notes, 'google_play', p_purchase_token
  ) RETURNING id INTO v_recharge_id;
  v_payment_ref := 'google_play:' || p_purchase_token;
  PERFORM set_config('app.wallet_ctx', jsonb_build_object(
    'source_type', 'google_play_purchase', 'source_id', v_recharge_id::text,
    'source_table', 'recharge_transactions', 'payment_method', 'google_play',
    'payment_reference', v_payment_ref, 'google_order_id', v_order_id,
    'product_id', v_requested_product, 'base_coins', v_pkg.coins_amount,
    'package_bonus_coins', v_pkg.bonus_coins)::text, true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + v_pkg.total_coins, updated_at = now()
   WHERE id = p_user_id RETURNING COALESCE(diamonds, 0) INTO v_balance_after;
  INSERT INTO public.coin_transfers (sender_id, receiver_id, amount, transfer_type, status, notes)
  VALUES (p_user_id, p_user_id, v_pkg.total_coins, 'google_play', 'completed', 'Google Play purchase: ' || v_requested_product);
  BEGIN
    INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, payment_method, payment_reference, status, notes)
    VALUES (p_user_id, LEAST(v_pkg.total_coins, 2147483000), 'recharge', 'google_play', v_payment_ref, 'completed', v_notes);
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.payment_reconciliation_log (external_reference, amount, currency, status, reconciled_at, notes)
    VALUES (COALESCE(v_order_id, p_purchase_token), v_pkg.price_usd, 'USD', 'credited', now(), v_notes);
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN
    v_bonus_result := public._apply_recharge_bonuses_internal(p_user_id, v_pkg.total_coins, v_recharge_id::text);
    SELECT COALESCE(diamonds, 0) INTO v_balance_after FROM public.profiles WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    v_bonus_result := jsonb_build_object('success', false, 'error', SQLERRM);
  END;
  v_invite_result := public.qualify_invitation_after_purchase(p_user_id, v_pkg.price_usd, v_pkg.total_coins, 'google_play', COALESCE(v_order_id, p_purchase_token));
  RETURN jsonb_build_object('success', true, 'alreadyProcessed', false, 'coins', v_pkg.total_coins,
    'baseCoins', v_pkg.coins_amount, 'bonusCoins', v_pkg.bonus_coins,
    'priceUsd', v_pkg.price_usd, 'newBalance', v_balance_after,
    'transactionId', v_recharge_id, 'invitation', v_invite_result,
    'recharge_bonus', v_bonus_result);
END; $function$;


-- ---- safe_credit_diamonds ----
CREATE OR REPLACE FUNCTION public.safe_credit_diamonds(p_user_id uuid, p_amount integer, p_gateway text DEFAULT NULL::text, p_order_id text DEFAULT NULL::text, p_transaction_id text DEFAULT NULL::text, p_amount_usd numeric DEFAULT NULL::numeric, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _new_balance integer; _payment_ref text; _inserted_id uuid;
  _is_service boolean; _bonus_result jsonb; _invite_result jsonb;
BEGIN
  _is_service := COALESCE(auth.role(), '') = 'service_role';
  IF NOT _is_service AND NOT public.is_admin(auth.uid()) AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: safe_credit_diamonds requires service or admin context';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be positive');
  END IF;
  _payment_ref := COALESCE(p_order_id, '') || ':' || COALESCE(p_transaction_id, '');
  IF _payment_ref = ':' THEN
    _payment_ref := COALESCE(p_gateway,'unknown') || ':' || p_user_id::text || ':' || p_amount::text || ':' || extract(epoch from clock_timestamp())::text;
  END IF;
  PERFORM set_config('app.wallet_ctx', jsonb_build_object(
    'source_type', 'safe_credit_diamonds',
    'source_id', COALESCE(p_order_id, p_transaction_id, _payment_ref),
    'source_table', 'coin_transactions',
    'payment_method', COALESCE(p_gateway, 'unknown'),
    'payment_reference', _payment_ref,
    'amount_usd', p_amount_usd,
    'metadata', COALESCE(p_metadata, '{}'::jsonb))::text, true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  BEGIN
    INSERT INTO public.coin_transactions (user_id, coins_amount, transaction_type, payment_method, payment_reference, status, notes)
    VALUES (p_user_id, p_amount, 'recharge', p_gateway, _payment_ref, 'completed', 'order:' || COALESCE(p_order_id, 'N/A') || ' txn:' || COALESCE(p_transaction_id, 'N/A'))
    RETURNING id INTO _inserted_id;
  EXCEPTION WHEN unique_violation THEN
    _invite_result := public.qualify_invitation_after_purchase(p_user_id, p_amount_usd, p_amount, p_gateway, _payment_ref);
    SELECT COALESCE(diamonds, 0) INTO _new_balance FROM public.profiles WHERE id = p_user_id;
    RETURN json_build_object('success', true, 'already_credited', true, 'new_balance', COALESCE(_new_balance, 0), 'payment_reference', _payment_ref, 'invitation', _invite_result);
  END;
  UPDATE public.profiles
     SET diamonds = COALESCE(diamonds, 0) + p_amount,
         total_recharged = COALESCE(total_recharged, 0) + p_amount,
         updated_at = now()
   WHERE id = p_user_id RETURNING diamonds INTO _new_balance;
  IF NOT FOUND THEN
    DELETE FROM public.coin_transactions WHERE id = _inserted_id;
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  BEGIN
    INSERT INTO public.payment_reconciliation_log (user_id, gateway, order_id, transaction_id, amount_coins, amount_usd, metadata, status)
    VALUES (p_user_id, p_gateway, p_order_id, p_transaction_id, p_amount, p_amount_usd, p_metadata, 'credited');
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  IF COALESCE(p_gateway, '') <> 'google_play' THEN
    BEGIN
      INSERT INTO public.recharge_transactions (
        user_id, order_id, payment_method, amount, coins_amount, bonus_coins,
        status, processed_at, created_at, updated_at, currency, usd_amount,
        coins_received, completed_at, currency_code, notes, purchase_source, transaction_id
      ) VALUES (
        p_user_id, p_order_id, COALESCE(p_gateway, 'unknown'), COALESCE(p_amount_usd, 0), p_amount, 0,
        'completed', now(), now(), now(), 'USD', p_amount_usd,
        p_amount, now(), 'USD',
        'Auto-canonicalized from safe_credit_diamonds. Ref: ' || _payment_ref,
        COALESCE(p_gateway, 'unknown'), COALESCE(p_transaction_id, p_order_id, _payment_ref)
      );
    EXCEPTION WHEN unique_violation THEN NULL;
    WHEN OTHERS THEN NULL; END;
  END IF;
  BEGIN
    _bonus_result := public._apply_recharge_bonuses_internal(p_user_id, p_amount, _inserted_id::text);
    SELECT COALESCE(diamonds, 0) INTO _new_balance FROM public.profiles WHERE id = p_user_id;
  EXCEPTION WHEN OTHERS THEN
    _bonus_result := jsonb_build_object('success', false, 'error', SQLERRM);
  END;
  _invite_result := public.qualify_invitation_after_purchase(p_user_id, p_amount_usd, p_amount, p_gateway, _payment_ref);
  RETURN json_build_object('success', true, 'new_balance', _new_balance, 'amount_credited', p_amount, 'payment_reference', _payment_ref, 'bonuses', _bonus_result, 'invitation', _invite_result);
END; $function$;

COMMIT;