
-- Add country_code to topup_helpers for location-based order routing
ALTER TABLE public.topup_helpers 
ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'BD',
ADD COLUMN IF NOT EXISTS supported_countries TEXT[] DEFAULT ARRAY['BD'],
ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

-- Create index for faster country-based lookup
CREATE INDEX IF NOT EXISTS idx_topup_helpers_country ON public.topup_helpers(country_code);
CREATE INDEX IF NOT EXISTS idx_topup_helpers_supported_countries ON public.topup_helpers USING GIN(supported_countries);

-- Add country_code to helper_orders for tracking
ALTER TABLE public.helper_orders
ADD COLUMN IF NOT EXISTS user_country_code TEXT DEFAULT 'BD';

-- Create a function to find best helper based on user's country
CREATE OR REPLACE FUNCTION public.find_available_helper(user_country TEXT DEFAULT 'BD')
RETURNS TABLE(
  helper_id UUID,
  user_id UUID,
  wallet_balance NUMERIC,
  country_code TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    th.id as helper_id,
    th.user_id,
    th.wallet_balance,
    th.country_code
  FROM topup_helpers th
  WHERE th.is_active = true 
    AND th.is_verified = true
    AND th.wallet_balance > 0
    AND (th.country_code = user_country OR user_country = ANY(th.supported_countries))
  ORDER BY 
    CASE WHEN th.country_code = user_country THEN 0 ELSE 1 END,
    th.wallet_balance DESC
  LIMIT 10;
END;
$$;

-- Create function for helper to transfer coins to user
CREATE OR REPLACE FUNCTION public.helper_transfer_coins(
  _user_app_uid TEXT,
  _coin_amount INT,
  _notes TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _helper_id UUID;
  _helper_wallet NUMERIC;
  _target_user_id UUID;
  _result JSON;
BEGIN
  -- Get helper info
  SELECT th.id, th.wallet_balance INTO _helper_id, _helper_wallet
  FROM topup_helpers th
  WHERE th.user_id = auth.uid() AND th.is_active = true AND th.is_verified = true;
  
  IF _helper_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Helper not found or not verified');
  END IF;
  
  -- Check wallet balance
  IF _helper_wallet < _coin_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient wallet balance');
  END IF;
  
  -- Find target user by app_uid
  SELECT id INTO _target_user_id FROM profiles WHERE app_uid = _user_app_uid;
  
  IF _target_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found with this ID');
  END IF;
  
  -- Deduct from helper wallet
  UPDATE topup_helpers 
  SET wallet_balance = wallet_balance - _coin_amount,
      total_sold = COALESCE(total_sold, 0) + _coin_amount
  WHERE id = _helper_id;
  
  -- Add to user coins
  UPDATE profiles 
  SET coins = COALESCE(coins, 0) + _coin_amount 
  WHERE id = _target_user_id;
  
  -- Record transaction
  INSERT INTO helper_transactions (
    helper_id, user_id, transaction_type, coin_amount, status, notes
  ) VALUES (
    _helper_id, _target_user_id, 'transfer_to_user', _coin_amount, 'completed', _notes
  );
  
  RETURN json_build_object(
    'success', true, 
    'message', 'Coins transferred successfully',
    'transferred_amount', _coin_amount,
    'new_wallet_balance', _helper_wallet - _coin_amount
  );
END;
$$;

-- Create function to create order and route to appropriate helper
CREATE OR REPLACE FUNCTION public.create_helper_order(
  _package_id UUID,
  _payment_method TEXT,
  _amount_usd NUMERIC,
  _amount_local NUMERIC,
  _currency_code TEXT DEFAULT 'BDT',
  _country_code TEXT DEFAULT 'BD',
  _payment_proof TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  _helper_id UUID;
  _helper_record RECORD;
  _package RECORD;
  _order_id UUID;
BEGIN
  _user_id := auth.uid();
  
  IF _user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get package info
  SELECT * INTO _package FROM coin_packages WHERE id = _package_id;
  
  IF _package IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid package');
  END IF;
  
  -- Find best available helper for user's country
  SELECT th.id INTO _helper_id
  FROM topup_helpers th
  WHERE th.is_active = true 
    AND th.is_verified = true
    AND th.wallet_balance >= _package.coins
    AND (th.country_code = _country_code OR _country_code = ANY(th.supported_countries))
  ORDER BY 
    CASE WHEN th.country_code = _country_code THEN 0 ELSE 1 END,
    th.display_order ASC,
    th.wallet_balance DESC
  LIMIT 1;
  
  IF _helper_id IS NULL THEN
    -- Fallback: find any helper with sufficient balance
    SELECT th.id INTO _helper_id
    FROM topup_helpers th
    WHERE th.is_active = true AND th.is_verified = true AND th.wallet_balance >= _package.coins
    ORDER BY th.wallet_balance DESC
    LIMIT 1;
  END IF;
  
  IF _helper_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No helper available at the moment');
  END IF;
  
  -- Create order
  INSERT INTO helper_orders (
    helper_id, user_id, package_id, coin_amount, 
    amount_usd, amount_local, currency_code, 
    payment_method, user_country_code, user_payment_proof, status
  ) VALUES (
    _helper_id, _user_id, _package_id, _package.coins,
    _amount_usd, _amount_local, _currency_code,
    _payment_method, _country_code, _payment_proof, 'pending'
  )
  RETURNING id INTO _order_id;
  
  RETURN json_build_object(
    'success', true,
    'order_id', _order_id,
    'helper_id', _helper_id,
    'message', 'Order created successfully'
  );
END;
$$;
