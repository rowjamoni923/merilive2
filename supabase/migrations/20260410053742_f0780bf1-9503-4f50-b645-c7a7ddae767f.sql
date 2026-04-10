
-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid TEXT;
  _display_name TEXT;
BEGIN
  _uid := 'U' || LPAD(FLOOR(RANDOM() * 99999999)::TEXT, 8, '0');
  
  _display_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    'User'
  );

  INSERT INTO public.profiles (
    id, uid, display_name, email, avatar_url,
    coins_balance, diamonds_balance, beans_balance,
    level, xp, vip_level, is_verified, is_online,
    created_at, updated_at
  ) VALUES (
    NEW.id, _uid, _display_name, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    0, 0, 0, 1, 0, 0, false, false, now(), now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Place game bet
CREATE OR REPLACE FUNCTION public.place_game_bet(
  p_user_id UUID, p_game_type TEXT, p_bet_amount INTEGER
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _cb INTEGER; _nb INTEGER;
BEGIN
  SELECT diamonds_balance INTO _cb FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF _cb IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  IF _cb < p_bet_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'current_balance', _cb); END IF;
  _nb := _cb - p_bet_amount;
  UPDATE public.profiles SET diamonds_balance = _nb, updated_at = now() WHERE id = p_user_id;
  INSERT INTO public.game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
  VALUES (p_user_id, p_game_type, 'bet', p_bet_amount, _cb, _nb);
  RETURN jsonb_build_object('success', true, 'new_balance', _nb);
END;
$$;

-- Process game win
CREATE OR REPLACE FUNCTION public.process_game_win(
  p_user_id UUID, p_game_type TEXT, p_win_amount INTEGER
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _cb INTEGER; _nb INTEGER;
BEGIN
  SELECT diamonds_balance INTO _cb FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF _cb IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  _nb := _cb + p_win_amount;
  UPDATE public.profiles SET diamonds_balance = _nb, updated_at = now() WHERE id = p_user_id;
  INSERT INTO public.game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
  VALUES (p_user_id, p_game_type, 'win', p_win_amount, _cb, _nb);
  RETURN jsonb_build_object('success', true, 'new_balance', _nb);
END;
$$;

-- Deduct coins atomic
CREATE OR REPLACE FUNCTION public.deduct_coins_atomic(
  p_user_id UUID, p_amount INTEGER, p_reason TEXT DEFAULT 'deduction'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _cb INTEGER; _nb INTEGER;
BEGIN
  SELECT diamonds_balance INTO _cb FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF _cb IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  IF _cb < p_amount THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance'); END IF;
  _nb := _cb - p_amount;
  UPDATE public.profiles SET diamonds_balance = _nb, updated_at = now() WHERE id = p_user_id;
  RETURN jsonb_build_object('success', true, 'new_balance', _nb);
END;
$$;
