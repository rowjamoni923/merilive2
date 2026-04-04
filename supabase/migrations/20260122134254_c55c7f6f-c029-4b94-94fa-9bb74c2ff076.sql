-- Update transfer_coins_to_user to require face verification
CREATE OR REPLACE FUNCTION public.transfer_coins_to_user(
  _receiver_id UUID,
  _amount INTEGER,
  _note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sender_id UUID;
  _agency_id UUID;
  _agency_balance INTEGER;
  _transfer_id UUID;
  _sender_face_verified BOOLEAN;
BEGIN
  _sender_id := auth.uid();
  
  -- Check if sender has completed face verification
  SELECT is_face_verified INTO _sender_face_verified
  FROM public.profiles
  WHERE id = _sender_id;
  
  IF _sender_face_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'Face verification required to transfer beans. Please complete face verification first.';
  END IF;
  
  -- Check if sender is an agency owner
  SELECT id, wallet_balance INTO _agency_id, _agency_balance
  FROM public.agencies
  WHERE owner_id = _sender_id AND is_active = true;
  
  IF _agency_id IS NULL THEN
    RAISE EXCEPTION 'You are not an agency owner';
  END IF;
  
  -- Check minimum transfer amount
  IF _amount < 10000 THEN
    RAISE EXCEPTION 'Minimum transfer amount is 10,000 coins';
  END IF;
  
  -- Check if agency has enough balance
  IF _agency_balance < _amount THEN
    RAISE EXCEPTION 'Insufficient agency balance';
  END IF;
  
  -- Check if receiver exists
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _receiver_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Create transfer record
  INSERT INTO public.coin_transfers (sender_id, sender_type, receiver_id, amount, note, status)
  VALUES (_sender_id, 'agency', _receiver_id, _amount, _note, 'completed')
  RETURNING id INTO _transfer_id;
  
  -- Deduct from agency wallet
  UPDATE public.agencies
  SET wallet_balance = wallet_balance - _amount
  WHERE id = _agency_id;
  
  -- Add to user's coins
  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + _amount
  WHERE id = _receiver_id;
  
  RETURN _transfer_id;
END;
$$;

-- Update helper_transfer_coins to require face verification
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
  _sender_face_verified BOOLEAN;
  _result JSON;
BEGIN
  -- Check if sender has completed face verification
  SELECT is_face_verified INTO _sender_face_verified
  FROM public.profiles
  WHERE id = auth.uid();
  
  IF _sender_face_verified IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'Face verification required to transfer beans. Please complete face verification first.');
  END IF;
  
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
  
  RETURN json_build_object('success', true, 'message', 'Transfer completed successfully');
END;
$$;