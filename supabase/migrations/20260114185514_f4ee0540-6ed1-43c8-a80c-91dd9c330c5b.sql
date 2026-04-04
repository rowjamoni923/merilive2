-- Update admin_add_user_coins function to also update total_consumption and user_level
CREATE OR REPLACE FUNCTION public.admin_add_user_coins(
  _user_id UUID,
  _amount INTEGER,
  _note TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_profile RECORD;
  _new_balance INTEGER;
  _new_consumption BIGINT;
  _new_level INTEGER;
  _is_female_host BOOLEAN;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RETURN json_build_object('success', false, 'error', 'Not authorized');
  END IF;
  
  -- Get user profile
  SELECT * INTO _user_profile FROM profiles WHERE id = _user_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;
  
  -- Check if user is female host
  _is_female_host := (_user_profile.is_host = true AND _user_profile.gender = 'female');
  
  -- Calculate new consumption (only for non-host users, this represents top-up amount)
  _new_consumption := COALESCE(_user_profile.total_consumption, 0) + _amount;
  
  -- Calculate new level based on consumption (for regular users) or earnings (for female hosts)
  IF _is_female_host THEN
    -- Female hosts level is based on earnings, not consumption - don't change level from topup
    _new_level := COALESCE(_user_profile.user_level, 0);
  ELSE
    -- Regular users: Level based on total_consumption (top-up amount)
    _new_level := CASE
      WHEN _new_consumption >= 30000000000 THEN 50
      WHEN _new_consumption >= 10000000000 THEN 40
      WHEN _new_consumption >= 3000000000 THEN 30
      WHEN _new_consumption >= 1000000000 THEN 20
      WHEN _new_consumption >= 300000000 THEN 10
      WHEN _new_consumption >= 100000000 THEN 9
      WHEN _new_consumption >= 30000000 THEN 8
      WHEN _new_consumption >= 10000000 THEN 7
      WHEN _new_consumption >= 3000000 THEN 6
      WHEN _new_consumption >= 1000000 THEN 5
      WHEN _new_consumption >= 300000 THEN 4
      WHEN _new_consumption >= 100000 THEN 3
      WHEN _new_consumption >= 30000 THEN 2
      WHEN _new_consumption >= 10000 THEN 1
      ELSE 0
    END;
  END IF;
  
  -- Update user coins, total_consumption, and user_level
  UPDATE profiles 
  SET 
    coins = COALESCE(coins, 0) + _amount,
    total_consumption = _new_consumption,
    user_level = _new_level
  WHERE id = _user_id
  RETURNING coins INTO _new_balance;
  
  -- Log admin action
  PERFORM public.log_admin_action(
    'add_user_coins',
    'user',
    _user_id,
    jsonb_build_object(
      'amount', _amount,
      'note', _note,
      'previous_balance', COALESCE(_user_profile.coins, 0),
      'new_balance', _new_balance,
      'new_consumption', _new_consumption,
      'new_level', _new_level
    )
  );
  
  RETURN json_build_object(
    'success', true,
    'user_id', _user_id,
    'amount_added', _amount,
    'new_balance', _new_balance,
    'new_consumption', _new_consumption,
    'new_level', _new_level
  );
END;
$$;

-- Also create a function to recalculate user levels based on their current stats
-- This is useful for fixing existing users
CREATE OR REPLACE FUNCTION public.recalculate_user_level(_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_profile RECORD;
  _new_level INTEGER;
  _points BIGINT;
BEGIN
  -- Get user profile
  SELECT * INTO _user_profile FROM profiles WHERE id = _user_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Determine points based on user type
  IF _user_profile.is_host = true AND _user_profile.gender = 'female' THEN
    -- Female hosts: Level based on earnings
    _points := COALESCE(_user_profile.total_earnings, 0);
    _new_level := CASE
      WHEN _points >= 150000000 THEN 10
      WHEN _points >= 50000000 THEN 9
      WHEN _points >= 15000000 THEN 8
      WHEN _points >= 5000000 THEN 7
      WHEN _points >= 1500000 THEN 6
      WHEN _points >= 500000 THEN 5
      WHEN _points >= 150000 THEN 4
      WHEN _points >= 50000 THEN 3
      WHEN _points >= 15000 THEN 2
      WHEN _points >= 5000 THEN 1
      ELSE 0
    END;
  ELSE
    -- Regular users: Level based on consumption
    _points := COALESCE(_user_profile.total_consumption, 0);
    _new_level := CASE
      WHEN _points >= 30000000000 THEN 50
      WHEN _points >= 10000000000 THEN 40
      WHEN _points >= 3000000000 THEN 30
      WHEN _points >= 1000000000 THEN 20
      WHEN _points >= 300000000 THEN 10
      WHEN _points >= 100000000 THEN 9
      WHEN _points >= 30000000 THEN 8
      WHEN _points >= 10000000 THEN 7
      WHEN _points >= 3000000 THEN 6
      WHEN _points >= 1000000 THEN 5
      WHEN _points >= 300000 THEN 4
      WHEN _points >= 100000 THEN 3
      WHEN _points >= 30000 THEN 2
      WHEN _points >= 10000 THEN 1
      ELSE 0
    END;
  END IF;
  
  -- Update user level
  UPDATE profiles SET user_level = _new_level WHERE id = _user_id;
  
  RETURN _new_level;
END;
$$;

-- Create a trigger to update host level when they receive gifts (earnings increase)
CREATE OR REPLACE FUNCTION public.update_host_level_on_earnings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _receiver_profile RECORD;
  _new_level INTEGER;
BEGIN
  -- Get receiver profile
  SELECT * INTO _receiver_profile FROM profiles WHERE id = NEW.receiver_id;
  
  -- Only update level for female hosts
  IF _receiver_profile.is_host = true AND _receiver_profile.gender = 'female' THEN
    -- Calculate new level based on updated earnings
    SELECT 
      CASE
        WHEN _receiver_profile.total_earnings >= 150000000 THEN 10
        WHEN _receiver_profile.total_earnings >= 50000000 THEN 9
        WHEN _receiver_profile.total_earnings >= 15000000 THEN 8
        WHEN _receiver_profile.total_earnings >= 5000000 THEN 7
        WHEN _receiver_profile.total_earnings >= 1500000 THEN 6
        WHEN _receiver_profile.total_earnings >= 500000 THEN 5
        WHEN _receiver_profile.total_earnings >= 150000 THEN 4
        WHEN _receiver_profile.total_earnings >= 50000 THEN 3
        WHEN _receiver_profile.total_earnings >= 15000 THEN 2
        WHEN _receiver_profile.total_earnings >= 5000 THEN 1
        ELSE 0
      END INTO _new_level;
    
    -- Update host level if changed
    IF COALESCE(_receiver_profile.user_level, 0) <> _new_level THEN
      UPDATE profiles SET user_level = _new_level WHERE id = NEW.receiver_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists and create new one
DROP TRIGGER IF EXISTS update_host_level_on_gift ON gift_transactions;
CREATE TRIGGER update_host_level_on_gift
  AFTER INSERT ON gift_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_host_level_on_earnings();