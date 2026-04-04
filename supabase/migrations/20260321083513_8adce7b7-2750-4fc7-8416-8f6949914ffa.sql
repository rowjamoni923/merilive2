-- ========================================
-- Game Configs Table (Admin Panel থেকে গেম ম্যানেজ)
-- ========================================
CREATE TABLE IF NOT EXISTS public.game_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_key TEXT NOT NULL UNIQUE,
    game_name TEXT NOT NULL,
    game_name_bn TEXT,
    game_type TEXT NOT NULL DEFAULT 'slot',
    icon_url TEXT,
    preview_url TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    is_premium BOOLEAN DEFAULT false,
    min_bet BIGINT DEFAULT 1000,
    max_bet BIGINT DEFAULT 1000000,
    house_edge_percent NUMERIC(5,2) DEFAULT 5.00,
    payout_multipliers JSONB DEFAULT '[]'::jsonb,
    game_items JSONB DEFAULT '[]'::jsonb,
    display_order INT DEFAULT 0,
    available_in TEXT[] DEFAULT ARRAY['party_room', 'live_stream'],
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.game_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active games" ON public.game_configs
    FOR SELECT USING (is_active = true);

CREATE POLICY "Admin full access game_configs" ON public.game_configs
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true)
    );

-- ========================================
-- Game Transactions Table
-- ========================================
CREATE TABLE IF NOT EXISTS public.game_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_config_id UUID REFERENCES public.game_configs(id),
    game_key TEXT NOT NULL,
    room_id TEXT,
    bet_amount BIGINT NOT NULL DEFAULT 0,
    win_amount BIGINT NOT NULL DEFAULT 0,
    net_result BIGINT NOT NULL DEFAULT 0,
    bet_details JSONB DEFAULT '{}'::jsonb,
    result_details JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.game_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own game transactions" ON public.game_transactions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admin view all game transactions" ON public.game_transactions
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND is_active = true)
    );

-- ========================================
-- Secure Game Bet RPC
-- ========================================
CREATE OR REPLACE FUNCTION public.process_game_bet(
    p_user_id UUID,
    p_game_key TEXT,
    p_room_id TEXT,
    p_bet_amount BIGINT,
    p_bet_details JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_coins BIGINT;
    v_game_config game_configs%ROWTYPE;
    v_winning_slot INT;
    v_payout_multiplier NUMERIC;
    v_win_amount BIGINT;
    v_items JSONB;
    v_item JSONB;
    v_total_slots INT;
BEGIN
    SELECT coins INTO v_current_coins FROM profiles WHERE id = p_user_id;
    IF v_current_coins IS NULL THEN
        RETURN jsonb_build_object('error', 'User not found');
    END IF;

    SELECT * INTO v_game_config FROM game_configs WHERE game_key = p_game_key AND is_active = true;
    IF v_game_config IS NULL THEN
        RETURN jsonb_build_object('error', 'Game not found or inactive');
    END IF;

    IF p_bet_amount < v_game_config.min_bet THEN
        RETURN jsonb_build_object('error', 'Bet too small');
    END IF;
    IF p_bet_amount > v_game_config.max_bet THEN
        RETURN jsonb_build_object('error', 'Bet too large');
    END IF;
    IF v_current_coins < p_bet_amount THEN
        RETURN jsonb_build_object('error', 'Insufficient balance', 'balance', v_current_coins);
    END IF;

    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE profiles SET coins = coins - p_bet_amount WHERE id = p_user_id;

    v_items := v_game_config.game_items;
    v_total_slots := jsonb_array_length(v_items);
    
    IF v_total_slots > 0 THEN
        v_winning_slot := floor(random() * v_total_slots)::INT;
        v_item := v_items -> v_winning_slot;
        v_payout_multiplier := COALESCE((v_item ->> 'multiplier')::NUMERIC, 0);
        
        IF random() * 100 < v_game_config.house_edge_percent THEN
            v_winning_slot := 0;
            FOR i IN 0..(v_total_slots - 1) LOOP
                IF COALESCE((v_items -> i ->> 'multiplier')::NUMERIC, 0) < COALESCE((v_items -> v_winning_slot ->> 'multiplier')::NUMERIC, 999) THEN
                    v_winning_slot := i;
                END IF;
            END LOOP;
            v_item := v_items -> v_winning_slot;
            v_payout_multiplier := COALESCE((v_item ->> 'multiplier')::NUMERIC, 0);
        END IF;
    ELSE
        v_winning_slot := 0;
        v_payout_multiplier := 0;
        v_item := '{}'::jsonb;
    END IF;

    v_win_amount := (p_bet_amount * v_payout_multiplier)::BIGINT;

    IF v_win_amount > 0 THEN
        UPDATE profiles SET coins = coins + v_win_amount WHERE id = p_user_id;
    END IF;

    INSERT INTO game_transactions (user_id, game_config_id, game_key, room_id, bet_amount, win_amount, net_result, bet_details, result_details)
    VALUES (
        p_user_id, v_game_config.id, p_game_key, p_room_id, p_bet_amount, v_win_amount, v_win_amount - p_bet_amount,
        p_bet_details,
        jsonb_build_object(
            'winning_slot', v_winning_slot,
            'winning_item', COALESCE(v_item ->> 'name', 'unknown'),
            'winning_emoji', COALESCE(v_item ->> 'emoji', ''),
            'payout_multiplier', v_payout_multiplier,
            'house_edge', v_game_config.house_edge_percent
        )
    );

    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    RETURN jsonb_build_object(
        'success', true,
        'winning_slot', v_winning_slot,
        'winning_item', COALESCE(v_item ->> 'name', 'unknown'),
        'winning_emoji', COALESCE(v_item ->> 'emoji', ''),
        'payout_multiplier', v_payout_multiplier,
        'total_payout', v_win_amount,
        'net_result', v_win_amount - p_bet_amount,
        'new_balance', v_current_coins - p_bet_amount + v_win_amount
    );
END;
$$;

-- Default game configs
INSERT INTO game_configs (game_key, game_name, game_name_bn, game_type, min_bet, max_bet, house_edge_percent, display_order, game_items) VALUES
('ferris_wheel', 'Ferris Wheel', 'ফেরিস হুইল', 'slot', 1000, 500000, 5.00, 1,
 '[{"slot":0,"name":"Burger","emoji":"🍔","multiplier":2.0},{"slot":1,"name":"Pizza","emoji":"🍕","multiplier":3.0},{"slot":2,"name":"Fries","emoji":"🍟","multiplier":1.5},{"slot":3,"name":"Cake","emoji":"🎂","multiplier":5.0},{"slot":4,"name":"Ice Cream","emoji":"🍦","multiplier":2.5},{"slot":5,"name":"Donut","emoji":"🍩","multiplier":4.0},{"slot":6,"name":"Sushi","emoji":"🍣","multiplier":8.0},{"slot":7,"name":"Taco","emoji":"🌮","multiplier":1.8}]'::jsonb
),
('teen_patti', 'Teen Patti', 'তিন পাত্তি', 'card', 1000, 500000, 4.00, 2,
 '[{"hand":"trail","multiplier":50},{"hand":"pure_sequence","multiplier":30},{"hand":"sequence","multiplier":15},{"hand":"color","multiplier":10},{"hand":"pair","multiplier":2},{"hand":"high_card","multiplier":1}]'::jsonb
),
('roulette', 'Roulette', 'রুলেট', 'roulette', 1000, 1000000, 5.26, 3,
 '[{"type":"number","multiplier":35},{"type":"red","multiplier":2},{"type":"black","multiplier":2},{"type":"even","multiplier":2},{"type":"odd","multiplier":2},{"type":"1-18","multiplier":2},{"type":"19-36","multiplier":2}]'::jsonb
)
ON CONFLICT (game_key) DO NOTHING;

ALTER PUBLICATION supabase_realtime ADD TABLE public.game_configs;