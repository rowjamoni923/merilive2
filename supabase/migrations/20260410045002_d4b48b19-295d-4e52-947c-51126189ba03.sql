
-- Game session tokens for external game provider integration
CREATE TABLE public.game_session_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex') || extract(epoch from now())::bigint::text,
  merchant_id text NOT NULL DEFAULT '1000000',
  game_id text,
  room_id text,
  balance_snapshot bigint DEFAULT 0,
  is_active boolean DEFAULT true,
  expires_at timestamptz DEFAULT (now() + interval '24 hours'),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for fast token lookups (callback API)
CREATE INDEX idx_game_session_tokens_token ON public.game_session_tokens(token);
CREATE INDEX idx_game_session_tokens_user ON public.game_session_tokens(user_id, is_active);

-- Enable RLS
ALTER TABLE public.game_session_tokens ENABLE ROW LEVEL SECURITY;

-- Users can see their own tokens
CREATE POLICY "Users can view own game tokens"
  ON public.game_session_tokens FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own tokens
CREATE POLICY "Users can create own game tokens"
  ON public.game_session_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Function to generate a game token (called from edge function)
CREATE OR REPLACE FUNCTION public.generate_game_token(
  p_user_id uuid,
  p_merchant_id text DEFAULT '1000000',
  p_game_id text DEFAULT NULL,
  p_room_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_balance bigint;
  v_result jsonb;
BEGIN
  -- Get user's current diamond balance
  SELECT COALESCE(coins, 0) INTO v_balance
  FROM profiles WHERE id = p_user_id;

  -- Deactivate old tokens for this user
  UPDATE game_session_tokens 
  SET is_active = false, updated_at = now()
  WHERE user_id = p_user_id AND is_active = true;

  -- Generate unique token: hex(16 random bytes) + timestamp
  v_token := encode(gen_random_bytes(16), 'hex') || extract(epoch from now())::bigint::text;

  -- Insert new token
  INSERT INTO game_session_tokens (user_id, token, merchant_id, game_id, room_id, balance_snapshot)
  VALUES (p_user_id, v_token, p_merchant_id, p_game_id, p_room_id, v_balance);

  v_result := jsonb_build_object(
    'success', true,
    'token', v_token,
    'balance', v_balance,
    'merchant_id', p_merchant_id
  );

  RETURN v_result;
END;
$$;

-- Function to handle game balance callbacks (getUserInfo, placeBet, settleBet)
CREATE OR REPLACE FUNCTION public.handle_game_callback(
  p_action text,
  p_token text,
  p_amount bigint DEFAULT 0,
  p_game_id text DEFAULT NULL,
  p_round_id text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_balance bigint;
  v_new_balance bigint;
  v_token_record record;
BEGIN
  -- Find and validate token
  SELECT * INTO v_token_record
  FROM game_session_tokens
  WHERE token = p_token AND is_active = true AND expires_at > now();

  IF v_token_record IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired token', 'code', 401);
  END IF;

  v_user_id := v_token_record.user_id;

  -- Get current balance
  SELECT COALESCE(coins, 0) INTO v_balance
  FROM profiles WHERE id = v_user_id;

  -- Handle different actions
  CASE p_action
    WHEN 'getUserInfo', 'getBalance' THEN
      -- Return user info and balance
      RETURN jsonb_build_object(
        'success', true,
        'userId', v_user_id,
        'balance', v_balance,
        'currency', 'DIAMOND'
      );

    WHEN 'placeBet', 'bet', 'debit' THEN
      -- Validate sufficient balance
      IF v_balance < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'code', 402, 'balance', v_balance);
      END IF;

      -- Deduct balance using bypass
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE profiles SET coins = coins - p_amount WHERE id = v_user_id;
      
      v_new_balance := v_balance - p_amount;

      -- Log transaction
      INSERT INTO game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
      VALUES (v_user_id, COALESCE(p_game_id, v_token_record.game_id, 'external'), 'bet', p_amount, v_balance, v_new_balance);

      RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'transactionId', gen_random_uuid());

    WHEN 'settleBet', 'win', 'credit' THEN
      -- Credit winnings
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE profiles SET coins = coins + p_amount WHERE id = v_user_id;
      
      v_new_balance := v_balance + p_amount;

      -- Log transaction
      INSERT INTO game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
      VALUES (v_user_id, COALESCE(p_game_id, v_token_record.game_id, 'external'), 'win', p_amount, v_balance, v_new_balance);

      RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'transactionId', gen_random_uuid());

    WHEN 'refund', 'rollback' THEN
      -- Refund a bet
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE profiles SET coins = coins + p_amount WHERE id = v_user_id;
      
      v_new_balance := v_balance + p_amount;

      INSERT INTO game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
      VALUES (v_user_id, COALESCE(p_game_id, v_token_record.game_id, 'external'), 'refund', p_amount, v_balance, v_new_balance);

      RETURN jsonb_build_object('success', true, 'balance', v_new_balance);

    ELSE
      RETURN jsonb_build_object('success', false, 'error', 'Unknown action: ' || p_action, 'code', 400);
  END CASE;
END;
$$;
