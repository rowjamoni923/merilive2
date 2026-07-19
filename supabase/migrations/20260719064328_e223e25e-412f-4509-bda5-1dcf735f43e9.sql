BEGIN;

CREATE OR REPLACE FUNCTION public.purchase_shop_item(_item_id uuid, _equip boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
  _item public.shop_items%ROWTYPE;
  _profile public.profiles%ROWTYPE;
  _price integer; _expires_at timestamptz; _purchase_id uuid;
  _equip_updates jsonb; _new_balance bigint;
BEGIN
  IF _user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  SELECT * INTO _item FROM public.shop_items WHERE id = _item_id AND is_active = true FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'item_not_found'); END IF;
  _price := greatest(coalesce(nullif(_item.price_diamonds, 0), nullif(_item.price_coins, 0), 0), 0);
  SELECT * INTO _profile FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'profile_not_found'); END IF;
  IF coalesce(_profile.coins, 0) < _price THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_diamonds',
      'required', _price, 'current', coalesce(_profile.coins, 0));
  END IF;
  _expires_at := CASE
    WHEN coalesce(_item.is_permanent, false) OR _item.duration_days IS NULL THEN NULL
    ELSE now() + (_item.duration_days || ' days')::interval END;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  PERFORM set_config('app.bypass_user_purchase_guard', 'true', true);
  UPDATE public.profiles SET diamonds = coalesce(diamonds, 0) - _price, updated_at = now()
   WHERE id = _user_id RETURNING coins INTO _new_balance;
  INSERT INTO public.user_purchases (user_id, item_id, item_type, price_paid, currency_type, expires_at, is_active, is_equipped)
  VALUES (_user_id, _item.id, coalesce(_item.category, _item.item_type, 'shop_item'), _price, 'coins', _expires_at, true, _equip)
  RETURNING id INTO _purchase_id;
  IF _equip THEN
    UPDATE public.user_purchases up SET is_equipped = false FROM public.shop_items si
    WHERE up.user_id = _user_id AND up.id <> _purchase_id AND up.is_active = true AND si.id = up.item_id
      AND CASE
        WHEN lower(coalesce(si.category, '')) IN ('frame','portrait_frame') THEN 'frame'
        WHEN lower(coalesce(si.category, '')) IN ('entrance','entrance_effect','entry_banner') THEN 'entrance'
        WHEN lower(coalesce(si.category, '')) IN ('entry_bar','entry_name_bar','entry_bar_effect') THEN 'entry_name_bar'
        WHEN lower(coalesce(si.category, '')) IN ('bubble','chat_bubble') THEN 'bubble'
        WHEN lower(coalesce(si.category, '')) IN ('vehicle','vehicle_entrance') THEN 'vehicle'
        WHEN lower(coalesce(si.category, '')) IN ('medal','badge','vip_medal') THEN 'medal'
        WHEN lower(coalesce(si.category, '')) = 'noble_card' THEN 'noble_card'
        ELSE lower(coalesce(si.category, '')) END
      = CASE
        WHEN lower(coalesce(_item.category, '')) IN ('frame','portrait_frame') THEN 'frame'
        WHEN lower(coalesce(_item.category, '')) IN ('entrance','entrance_effect','entry_banner') THEN 'entrance'
        WHEN lower(coalesce(_item.category, '')) IN ('entry_bar','entry_name_bar','entry_bar_effect') THEN 'entry_name_bar'
        WHEN lower(coalesce(_item.category, '')) IN ('bubble','chat_bubble') THEN 'bubble'
        WHEN lower(coalesce(_item.category, '')) IN ('vehicle','vehicle_entrance') THEN 'vehicle'
        WHEN lower(coalesce(_item.category, '')) IN ('medal','badge','vip_medal') THEN 'medal'
        WHEN lower(coalesce(_item.category, '')) = 'noble_card' THEN 'noble_card'
        ELSE lower(coalesce(_item.category, '')) END;
    _equip_updates := public._pkg311_profile_equip_update_for_shop_item(_profile, _item.id, _item.category);
    IF _equip_updates ? 'equipped_frame_id' THEN
      UPDATE public.profiles SET equipped_frame_id = (_equip_updates->>'equipped_frame_id')::uuid, previous_frame_id = COALESCE((_equip_updates->>'previous_frame_id')::uuid, previous_frame_id), updated_at = now() WHERE id = _user_id;
    ELSIF _equip_updates ? 'equipped_entrance_id' THEN
      UPDATE public.profiles SET equipped_entrance_id = (_equip_updates->>'equipped_entrance_id')::uuid, equipped_entry_banner_id = (_equip_updates->>'equipped_entry_banner_id')::uuid, previous_entrance_id = COALESCE((_equip_updates->>'previous_entrance_id')::uuid, previous_entrance_id), previous_entry_banner_id = COALESCE((_equip_updates->>'previous_entry_banner_id')::uuid, previous_entry_banner_id), updated_at = now() WHERE id = _user_id;
    ELSIF _equip_updates ? 'equipped_entry_name_bar_id' THEN
      UPDATE public.profiles SET equipped_entry_name_bar_id = (_equip_updates->>'equipped_entry_name_bar_id')::uuid, previous_entry_name_bar_id = COALESCE((_equip_updates->>'previous_entry_name_bar_id')::uuid, previous_entry_name_bar_id), updated_at = now() WHERE id = _user_id;
    ELSIF _equip_updates ? 'equipped_bubble_id' THEN
      UPDATE public.profiles SET equipped_bubble_id = (_equip_updates->>'equipped_bubble_id')::uuid, previous_bubble_id = COALESCE((_equip_updates->>'previous_bubble_id')::uuid, previous_bubble_id), updated_at = now() WHERE id = _user_id;
    ELSIF _equip_updates ? 'equipped_vehicle_id' THEN
      UPDATE public.profiles SET equipped_vehicle_id = (_equip_updates->>'equipped_vehicle_id')::uuid, previous_vehicle_id = COALESCE((_equip_updates->>'previous_vehicle_id')::uuid, previous_vehicle_id), updated_at = now() WHERE id = _user_id;
    ELSIF _equip_updates ? 'equipped_medal_id' THEN
      UPDATE public.profiles SET equipped_medal_id = (_equip_updates->>'equipped_medal_id')::uuid, previous_medal_id = COALESCE((_equip_updates->>'previous_medal_id')::uuid, previous_medal_id), updated_at = now() WHERE id = _user_id;
    ELSIF _equip_updates ? 'equipped_noble_card_id' THEN
      UPDATE public.profiles SET equipped_noble_card_id = (_equip_updates->>'equipped_noble_card_id')::uuid, previous_noble_card_id = COALESCE((_equip_updates->>'previous_noble_card_id')::uuid, previous_noble_card_id), updated_at = now() WHERE id = _user_id;
    END IF;
  END IF;
  UPDATE public.shop_items SET total_sold = coalesce(total_sold, 0) + 1, updated_at = now() WHERE id = _item.id;
  RETURN jsonb_build_object('success', true, 'purchase_id', _purchase_id, 'item_id', _item.id,
    'item_type', coalesce(_item.category, _item.item_type, 'shop_item'),
    'price_charged', _price, 'balance_after', _new_balance, 'expires_at', _expires_at, 'is_equipped', _equip);
END;
$function$;

CREATE OR REPLACE FUNCTION public.purchase_shop_item(p_item_type text, p_item_id uuid, p_duration_days integer DEFAULT NULL::integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_type text := lower(trim(coalesce(p_item_type, '')));
  v_level int; v_coins int; v_price int := 0; v_min_lv int := 0;
  v_dur int; v_exp timestamptz; dup boolean;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'not_authenticated'); END IF;
  SELECT COALESCE(user_level, 1), COALESCE(coins, 0) INTO v_level, v_coins
    FROM public.profiles WHERE id = uid FOR UPDATE;
  IF v_coins IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'profile_not_found'); END IF;

  IF v_type = 'avatar_frame' THEN
    SELECT COALESCE(NULLIF(price_diamonds, 0), 0), COALESCE(NULLIF(min_level, 0), NULLIF(level_required, 0), 0),
           COALESCE(p_duration_days, NULLIF(duration_days, 0), 30)
      INTO v_price, v_min_lv, v_dur
      FROM public.avatar_frames WHERE id = p_item_id AND is_active = true;
    IF v_price IS NULL OR v_price <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'item_not_found'); END IF;
    IF v_level < v_min_lv THEN RETURN jsonb_build_object('success', false, 'error', 'level_required', 'min_level', v_min_lv); END IF;
    SELECT EXISTS (SELECT 1 FROM public.user_role_frames ur WHERE ur.user_id = uid AND ur.frame_id = p_item_id
      AND COALESCE(ur.source_table, 'role_frames') = 'avatar_frames' AND (ur.expires_at IS NULL OR ur.expires_at > now())) INTO dup;
    IF dup THEN RETURN jsonb_build_object('success', false, 'error', 'already_owned'); END IF;
    DELETE FROM public.user_role_frames ur WHERE ur.user_id = uid AND ur.frame_id = p_item_id
      AND COALESCE(ur.source_table, 'role_frames') = 'avatar_frames' AND ur.expires_at IS NOT NULL AND ur.expires_at <= now();
  ELSIF v_type = 'role_frame' THEN
    SELECT COALESCE(NULLIF(price_diamonds, 0), 0), COALESCE(min_level, 0),
           COALESCE(p_duration_days, NULLIF(duration_days, 0), 30)
      INTO v_price, v_min_lv, v_dur FROM public.role_frames WHERE id = p_item_id AND is_active = true;
    IF v_price IS NULL OR v_price <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'item_not_found'); END IF;
    IF v_level < v_min_lv THEN RETURN jsonb_build_object('success', false, 'error', 'level_required', 'min_level', v_min_lv); END IF;
    SELECT EXISTS (SELECT 1 FROM public.user_role_frames ur WHERE ur.user_id = uid AND ur.frame_id = p_item_id
      AND COALESCE(ur.source_table, 'role_frames') = 'role_frames' AND (ur.expires_at IS NULL OR ur.expires_at > now())) INTO dup;
    IF dup THEN RETURN jsonb_build_object('success', false, 'error', 'already_owned'); END IF;
    DELETE FROM public.user_role_frames ur WHERE ur.user_id = uid AND ur.frame_id = p_item_id
      AND COALESCE(ur.source_table, 'role_frames') = 'role_frames' AND ur.expires_at IS NOT NULL AND ur.expires_at <= now();
  ELSIF v_type = 'entry_effect' THEN
    SELECT COALESCE(NULLIF(price_diamonds, 0), 0), COALESCE(min_level, 0),
           COALESCE(p_duration_days, NULLIF(duration_days, 0), 30)
      INTO v_price, v_min_lv, v_dur FROM public.entry_effects WHERE id = p_item_id AND is_active = true;
    IF v_price IS NULL OR v_price <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'item_not_found'); END IF;
    IF v_level < v_min_lv THEN RETURN jsonb_build_object('success', false, 'error', 'level_required', 'min_level', v_min_lv); END IF;
    SELECT EXISTS (SELECT 1 FROM public.user_entry_effects e WHERE e.user_id = uid AND e.effect_id = p_item_id
      AND (e.expires_at IS NULL OR e.expires_at > now())) INTO dup;
    IF dup THEN RETURN jsonb_build_object('success', false, 'error', 'already_owned'); END IF;
    DELETE FROM public.user_entry_effects e WHERE e.user_id = uid AND e.effect_id = p_item_id
      AND e.expires_at IS NOT NULL AND e.expires_at <= now();
  ELSIF v_type = 'chat_bubble' THEN
    SELECT COALESCE(NULLIF(price_diamonds, 0), 0), COALESCE(min_level, 0),
           COALESCE(p_duration_days, NULLIF(duration_days, 0), 30)
      INTO v_price, v_min_lv, v_dur FROM public.chat_bubbles WHERE id = p_item_id AND is_active = true;
    IF v_price IS NULL OR v_price <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'item_not_found'); END IF;
    IF v_level < v_min_lv THEN RETURN jsonb_build_object('success', false, 'error', 'level_required', 'min_level', v_min_lv); END IF;
    SELECT EXISTS (SELECT 1 FROM public.user_chat_bubbles c WHERE c.user_id = uid AND c.bubble_id = p_item_id
      AND (c.expires_at IS NULL OR c.expires_at > now())) INTO dup;
    IF dup THEN RETURN jsonb_build_object('success', false, 'error', 'already_owned'); END IF;
    DELETE FROM public.user_chat_bubbles c WHERE c.user_id = uid AND c.bubble_id = p_item_id
      AND c.expires_at IS NOT NULL AND c.expires_at <= now();
  ELSIF v_type = 'gift_item' THEN
    SELECT COALESCE(NULLIF(price_diamonds, 0), 0), COALESCE(min_level, 0),
           COALESCE(p_duration_days, NULLIF(duration_days, 0), 365)
      INTO v_price, v_min_lv, v_dur FROM public.gifts WHERE id = p_item_id AND is_active = true;
    IF v_price IS NULL OR v_price <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'item_not_found_or_not_for_sale'); END IF;
    IF v_level < v_min_lv THEN RETURN jsonb_build_object('success', false, 'error', 'level_required', 'min_level', v_min_lv); END IF;
    SELECT EXISTS (SELECT 1 FROM public.user_gift_shop_entitlements g WHERE g.user_id = uid AND g.gift_id = p_item_id
      AND (g.expires_at IS NULL OR g.expires_at > now())) INTO dup;
    IF dup THEN RETURN jsonb_build_object('success', false, 'error', 'already_owned'); END IF;
    DELETE FROM public.user_gift_shop_entitlements g WHERE g.user_id = uid AND g.gift_id = p_item_id
      AND g.expires_at IS NOT NULL AND g.expires_at <= now();
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'invalid_item_type');
  END IF;

  IF v_coins < v_price THEN RETURN jsonb_build_object('success', false, 'error', 'insufficient_diamonds'); END IF;
  v_exp := CASE WHEN v_dur IS NOT NULL AND v_dur > 0 THEN now() + (v_dur::text || ' days')::interval ELSE NULL END;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  PERFORM set_config('app.calling_function', 'purchase_shop_item', true);
  UPDATE public.profiles SET diamonds = diamonds - v_price WHERE id = uid;

  IF v_type = 'avatar_frame' THEN
    INSERT INTO public.user_role_frames (user_id, frame_id, source_table, role_type, expires_at, notes)
    VALUES (uid, p_item_id, 'avatar_frames', 'vip', v_exp, 'shop purchase');
  ELSIF v_type = 'role_frame' THEN
    INSERT INTO public.user_role_frames (user_id, frame_id, source_table, role_type, expires_at, notes)
    VALUES (uid, p_item_id, 'role_frames', 'vip', v_exp, 'shop purchase');
  ELSIF v_type = 'entry_effect' THEN
    INSERT INTO public.user_entry_effects (user_id, effect_id, expires_at) VALUES (uid, p_item_id, v_exp);
  ELSIF v_type = 'chat_bubble' THEN
    INSERT INTO public.user_chat_bubbles (user_id, bubble_id, expires_at) VALUES (uid, p_item_id, v_exp);
  ELSIF v_type = 'gift_item' THEN
    INSERT INTO public.user_gift_shop_entitlements (user_id, gift_id, expires_at) VALUES (uid, p_item_id, v_exp);
  END IF;
  RETURN jsonb_build_object('success', true, 'new_balance', (SELECT coins FROM public.profiles WHERE id = uid));
END;
$function$;

CREATE OR REPLACE FUNCTION public.roulette_place_bet(p_session_id uuid, p_bet_type text, p_amount bigint)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_session RECORD; v_mult numeric; v_cur bigint; v_new bigint; v_bet_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Login required'); END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid bet amount'); END IF;
  v_mult := public._roulette_official_multiplier(p_bet_type);
  IF v_mult IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid bet type'); END IF;
  SELECT id, status, betting_ends_at INTO v_session FROM live_game_rounds
    WHERE id = p_session_id AND game_type = 'roulette' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Round not found'); END IF;
  IF v_session.status <> 'betting' OR v_session.betting_ends_at <= now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Betting is closed');
  END IF;
  SELECT coins INTO v_cur FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_cur IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Profile not found'); END IF;
  IF v_cur < p_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_cur, 'new_balance', v_cur); END IF;
  v_new := v_cur - p_amount;
  PERFORM set_config('app.calling_function', 'roulette_place_bet', true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET diamonds = v_new, updated_at = now() WHERE id = v_uid;
  INSERT INTO roulette_bets (session_id, user_id, bet_type, bet_amount, multiplier, is_winner, win_amount)
  VALUES (p_session_id, v_uid, p_bet_type, p_amount::int, v_mult, false, 0)
  RETURNING id INTO v_bet_id;
  BEGIN
    INSERT INTO game_transactions (user_id, game_id, game_type, transaction_type, amount, bet_amount, win_amount, is_win, balance_before, balance_after)
    VALUES (v_uid, 'roulette', 'roulette', 'bet', p_amount, p_amount, 0, false, v_cur, v_new);
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object('success', true, 'bet_id', v_bet_id, 'new_balance', v_new, 'balance', v_new, 'multiplier', v_mult);
END;
$function$;

CREATE OR REPLACE FUNCTION public.roulette_spin_and_settle(p_session_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_session RECORD; v_winning_number integer; v_winning_color text;
  v_bet RECORD; v_payout bigint; v_total_pool bigint := 0; v_total_payout bigint := 0;
  v_cur bigint; v_new bigint;
  RED_NUMBERS constant int[] := ARRAY[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
BEGIN
  IF auth.uid() IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Login required'); END IF;
  SELECT * INTO v_session FROM live_game_rounds WHERE id = p_session_id AND game_type = 'roulette' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Round not found'); END IF;
  IF v_session.status = 'completed' AND v_session.winning_number IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_settled', true,
      'winning_number', v_session.winning_number, 'winning_color', v_session.winning_color);
  END IF;
  IF v_session.betting_ends_at IS NULL OR v_session.betting_ends_at > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Betting still open');
  END IF;
  v_winning_number := floor(public._secure_random() * 37)::int;
  IF v_winning_number > 36 THEN v_winning_number := 36; END IF;
  v_winning_color := CASE WHEN v_winning_number = 0 THEN 'green' WHEN v_winning_number = ANY (RED_NUMBERS) THEN 'red' ELSE 'black' END;
  PERFORM set_config('app.calling_function', 'roulette_spin_and_settle', true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  FOR v_bet IN SELECT id, user_id, bet_type, bet_amount, multiplier FROM roulette_bets WHERE session_id = p_session_id FOR UPDATE LOOP
    v_total_pool := v_total_pool + v_bet.bet_amount;
    IF public._roulette_is_winner(v_bet.bet_type, v_winning_number) THEN
      v_payout := (v_bet.bet_amount::numeric * v_bet.multiplier)::bigint;
      v_total_payout := v_total_payout + v_payout;
      UPDATE roulette_bets SET is_winner = true, win_amount = v_payout::int WHERE id = v_bet.id;
      SELECT coins INTO v_cur FROM profiles WHERE id = v_bet.user_id FOR UPDATE;
      v_new := COALESCE(v_cur, 0) + v_payout;
      UPDATE profiles SET diamonds = v_new, updated_at = now() WHERE id = v_bet.user_id;
      BEGIN
        INSERT INTO game_transactions (user_id, game_id, game_type, transaction_type,
          amount, bet_amount, win_amount, is_win, multiplier, balance_before, balance_after, result_data)
        VALUES (v_bet.user_id, 'roulette', 'roulette', 'win',
          v_payout, v_bet.bet_amount, v_payout, true, v_bet.multiplier, v_cur, v_new,
          jsonb_build_object('session_id', p_session_id, 'winning_number', v_winning_number, 'bet_type', v_bet.bet_type));
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
  END LOOP;
  UPDATE live_game_rounds SET status = 'completed', winning_number = v_winning_number,
    winning_color = v_winning_color, total_pool = v_total_pool::int, ended_at = now() WHERE id = p_session_id;
  RETURN jsonb_build_object('success', true, 'winning_number', v_winning_number,
    'winning_color', v_winning_color, 'total_pool', v_total_pool, 'total_payout', v_total_payout);
END;
$function$;

CREATE OR REPLACE FUNCTION public.secure_play_native_game(p_game_id text, p_bet_amount bigint)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID; v_current_balance BIGINT; v_new_balance BIGINT; v_cfg RECORD;
  v_roll FLOAT; v_is_win BOOLEAN := FALSE; v_payout BIGINT := 0; v_result JSONB;
  v_dice INT; v_reels INT[]; v_roulette_num INT; v_roulette_color TEXT;
  v_ferris_slot INT; v_tp_hand TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not authenticated'); END IF;
  IF p_bet_amount <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid bet amount'); END IF;
  SELECT game_id, name, win_probability, win_multiplier, min_bet, max_bet, is_active, config_data
    INTO v_cfg FROM public.game_configs WHERE game_id = p_game_id LIMIT 1;
  IF v_cfg.game_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Unknown game'); END IF;
  IF NOT v_cfg.is_active THEN RETURN jsonb_build_object('success', false, 'error', 'Game is disabled'); END IF;
  IF p_bet_amount < COALESCE(v_cfg.min_bet, 1) THEN RETURN jsonb_build_object('success', false, 'error', 'Bet below minimum', 'min_bet', v_cfg.min_bet); END IF;
  IF p_bet_amount > COALESCE(v_cfg.max_bet, 999999999) THEN RETURN jsonb_build_object('success', false, 'error', 'Bet above maximum', 'max_bet', v_cfg.max_bet); END IF;
  SELECT coins INTO v_current_balance FROM public.profiles WHERE id = v_user_id FOR UPDATE;
  IF v_current_balance IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Profile not found'); END IF;
  IF v_current_balance < p_bet_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_current_balance); END IF;
  v_roll := random();
  v_is_win := v_roll < COALESCE(v_cfg.win_probability, 0.5);
  IF p_game_id = 'dice' THEN
    v_dice := floor(random() * 6)::INT + 1;
    v_result := jsonb_build_object('dice_value', v_dice);
  ELSIF p_game_id = 'slots' THEN
    IF v_is_win THEN v_dice := floor(random() * 6)::INT; v_reels := ARRAY[v_dice, v_dice, v_dice];
    ELSE v_reels := ARRAY[floor(random() * 6)::INT, floor(random() * 6)::INT, floor(random() * 6)::INT]; END IF;
    v_result := jsonb_build_object('reels', v_reels);
  ELSIF p_game_id = 'roulette' THEN
    v_roulette_num := floor(random() * 37)::INT;
    v_roulette_color := CASE WHEN v_roulette_num = 0 THEN 'green' WHEN v_roulette_num % 2 = 0 THEN 'black' ELSE 'red' END;
    v_result := jsonb_build_object('number', v_roulette_num, 'color', v_roulette_color);
  ELSIF p_game_id = 'ferris_wheel' THEN
    v_ferris_slot := floor(random() * 8)::INT;
    v_result := jsonb_build_object('winning_slot', v_ferris_slot);
  ELSIF p_game_id = 'teen_patti' THEN
    v_tp_hand := CASE
      WHEN v_is_win AND random() < 0.05 THEN 'trail'
      WHEN v_is_win AND random() < 0.15 THEN 'pure_sequence'
      WHEN v_is_win AND random() < 0.30 THEN 'sequence'
      WHEN v_is_win AND random() < 0.55 THEN 'color'
      WHEN v_is_win THEN 'pair' ELSE 'high_card' END;
    v_result := jsonb_build_object('hand_rank', v_tp_hand);
  ELSE v_result := jsonb_build_object('roll', v_roll); END IF;
  IF v_is_win THEN v_payout := floor(p_bet_amount * COALESCE(v_cfg.win_multiplier, 2.0))::BIGINT; END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  v_new_balance := v_current_balance - p_bet_amount + v_payout;
  UPDATE public.profiles SET diamonds = v_new_balance WHERE id = v_user_id;
  INSERT INTO public.game_transactions (user_id, game_id, game_type, transaction_type, amount,
     bet_amount, win_amount, is_win, result_data, balance_before, balance_after)
  VALUES (v_user_id, p_game_id, p_game_id,
     CASE WHEN v_is_win THEN 'win' ELSE 'bet' END,
     p_bet_amount, p_bet_amount, v_payout, v_is_win, v_result, v_current_balance, v_new_balance);
  RETURN jsonb_build_object('success', true, 'is_win', v_is_win, 'payout', v_payout,
    'new_balance', v_new_balance, 'result_data', v_result);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM); END;
$function$;

CREATE OR REPLACE FUNCTION public.teen_patti_play(p_bet_a bigint DEFAULT 0, p_bet_b bigint DEFAULT 0, p_bet_c bigint DEFAULT 0)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_cur bigint; v_after_bet bigint; v_final bigint; v_total_bet bigint;
  v_bet_a bigint := GREATEST(0, COALESCE(p_bet_a, 0));
  v_bet_b bigint := GREATEST(0, COALESCE(p_bet_b, 0));
  v_bet_c bigint := GREATEST(0, COALESCE(p_bet_c, 0));
  v_deck_ranks int[]; v_deck_suits text[];
  v_a_ranks int[]; v_a_suits text[];
  v_b_ranks int[]; v_b_suits text[];
  v_c_ranks int[]; v_c_suits text[];
  v_sa int; v_sb int; v_sc int; v_max int; v_candidates text[]; v_winner text;
  v_bet_on_winner bigint; v_win_amount bigint := 0;
  SUITS constant text[] := ARRAY['S','H','D','C'];
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Login required'); END IF;
  v_total_bet := v_bet_a + v_bet_b + v_bet_c;
  IF v_total_bet <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'No bet placed'); END IF;
  SELECT coins INTO v_cur FROM profiles WHERE id = v_uid FOR UPDATE;
  IF v_cur IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Profile not found'); END IF;
  IF v_cur < v_total_bet THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_cur, 'new_balance', v_cur); END IF;
  v_after_bet := v_cur - v_total_bet;
  PERFORM set_config('app.calling_function', 'teen_patti_play', true);
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET diamonds = v_after_bet, updated_at = now() WHERE id = v_uid;
  WITH deck AS (
    SELECT (r) AS rank, s AS suit, public._secure_random() AS o
    FROM generate_series(1, 13) r, unnest(SUITS) s
  ),
  shuffled AS (SELECT rank, suit, row_number() OVER (ORDER BY o) AS rn FROM deck)
  SELECT array_agg(rank ORDER BY rn) FILTER (WHERE rn <= 9),
         array_agg(suit ORDER BY rn) FILTER (WHERE rn <= 9)
  INTO v_deck_ranks, v_deck_suits FROM shuffled WHERE rn <= 9;
  v_a_ranks := ARRAY[v_deck_ranks[1], v_deck_ranks[2], v_deck_ranks[3]];
  v_a_suits := ARRAY[v_deck_suits[1], v_deck_suits[2], v_deck_suits[3]];
  v_b_ranks := ARRAY[v_deck_ranks[4], v_deck_ranks[5], v_deck_ranks[6]];
  v_b_suits := ARRAY[v_deck_suits[4], v_deck_suits[5], v_deck_suits[6]];
  v_c_ranks := ARRAY[v_deck_ranks[7], v_deck_ranks[8], v_deck_ranks[9]];
  v_c_suits := ARRAY[v_deck_suits[7], v_deck_suits[8], v_deck_suits[9]];
  v_sa := public._teen_patti_score(v_a_ranks, v_a_suits);
  v_sb := public._teen_patti_score(v_b_ranks, v_b_suits);
  v_sc := public._teen_patti_score(v_c_ranks, v_c_suits);
  v_max := GREATEST(v_sa, v_sb, v_sc);
  v_candidates := ARRAY[]::text[];
  IF v_sa = v_max THEN v_candidates := array_append(v_candidates, 'A'); END IF;
  IF v_sb = v_max THEN v_candidates := array_append(v_candidates, 'B'); END IF;
  IF v_sc = v_max THEN v_candidates := array_append(v_candidates, 'C'); END IF;
  v_winner := v_candidates[1 + floor(public._secure_random() * array_length(v_candidates,1))::int];
  v_bet_on_winner := CASE v_winner WHEN 'A' THEN v_bet_a WHEN 'B' THEN v_bet_b ELSE v_bet_c END;
  IF v_bet_on_winner > 0 THEN
    v_win_amount := v_bet_on_winner * 2;
    v_final := v_after_bet + v_win_amount;
    UPDATE profiles SET diamonds = v_final, updated_at = now() WHERE id = v_uid;
  ELSE v_final := v_after_bet; END IF;
  BEGIN
    INSERT INTO game_transactions (user_id, game_id, game_type, transaction_type,
       amount, bet_amount, win_amount, is_win, multiplier, balance_before, balance_after, result_data)
    VALUES (v_uid, 'teen-patti', 'teen_patti',
       CASE WHEN v_win_amount > 0 THEN 'win' ELSE 'bet' END,
       CASE WHEN v_win_amount > 0 THEN v_win_amount ELSE v_total_bet END,
       v_total_bet, v_win_amount, v_win_amount > 0,
       CASE WHEN v_win_amount > 0 THEN 2 ELSE NULL END,
       v_cur, v_final,
       jsonb_build_object('winner', v_winner, 'tie_count', array_length(v_candidates,1),
         'bets', jsonb_build_object('A', v_bet_a, 'B', v_bet_b, 'C', v_bet_c),
         'hands', jsonb_build_object(
           'A', jsonb_build_object('ranks', v_a_ranks, 'suits', v_a_suits, 'score', v_sa),
           'B', jsonb_build_object('ranks', v_b_ranks, 'suits', v_b_suits, 'score', v_sb),
           'C', jsonb_build_object('ranks', v_c_ranks, 'suits', v_c_suits, 'score', v_sc))));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object('success', true, 'winner', v_winner, 'win_amount', v_win_amount,
    'new_balance', v_final, 'balance', v_final,
    'hands', jsonb_build_object(
      'A', jsonb_build_object('ranks', v_a_ranks, 'suits', v_a_suits, 'score', v_sa),
      'B', jsonb_build_object('ranks', v_b_ranks, 'suits', v_b_suits, 'score', v_sb),
      'C', jsonb_build_object('ranks', v_c_ranks, 'suits', v_c_suits, 'score', v_sc)));
END;
$function$;

COMMIT;