-- =====================================================
-- SECURITY FIX BATCH 2 - CORRECTED VERSION
-- =====================================================

-- Fix auto_process_live_game function
CREATE OR REPLACE FUNCTION public.auto_process_live_game()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Process any rounds that need processing
  UPDATE public.live_game_rounds
  SET status = 'completed'
  WHERE status = 'playing'
    AND ends_at < now();
    
  SELECT jsonb_build_object(
    'processed', true,
    'timestamp', now()
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Fix create_live_game_round function
CREATE OR REPLACE FUNCTION public.create_live_game_round(
  p_game_id text,
  p_room_id uuid DEFAULT NULL,
  p_betting_seconds integer DEFAULT 30
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round_id uuid;
BEGIN
  INSERT INTO public.live_game_rounds (
    game_id,
    room_id,
    status,
    betting_ends_at
  ) VALUES (
    p_game_id,
    p_room_id,
    'betting',
    now() + (p_betting_seconds || ' seconds')::interval
  )
  RETURNING id INTO v_round_id;
  
  RETURN v_round_id;
END;
$$;

-- Fix notify_new_message function
CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_notify(
    'new_message',
    json_build_object(
      'id', NEW.id,
      'conversation_id', NEW.conversation_id,
      'sender_id', NEW.sender_id
    )::text
  );
  RETURN NEW;
END;
$$;

-- Fix handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Fix check_user_permission function
CREATE OR REPLACE FUNCTION public.check_user_permission(
  p_user_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role = 'admin'
  );
END;
$$;

-- Fix get_user_level function - USE user_level column
CREATE OR REPLACE FUNCTION public.get_user_level(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(user_level, 1)
  FROM public.profiles
  WHERE id = p_user_id
$$;

-- Fix get_user_beans function
CREATE OR REPLACE FUNCTION public.get_user_beans(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(beans, 0)
  FROM public.profiles
  WHERE id = p_user_id
$$;

-- Fix get_user_coins function - coins is bigint
CREATE OR REPLACE FUNCTION public.get_user_coins(p_user_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(coins, 0)
  FROM public.profiles
  WHERE id = p_user_id
$$;

-- Fix increment_view_count function
CREATE OR REPLACE FUNCTION public.increment_view_count(p_table text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_table = 'reels' THEN
    UPDATE public.reels SET view_count = COALESCE(view_count, 0) + 1 WHERE id = p_id;
  ELSIF p_table = 'live_streams' THEN
    UPDATE public.live_streams SET viewer_count = COALESCE(viewer_count, 0) + 1 WHERE id = p_id;
  END IF;
END;
$$;

-- Fix calculate_commission function
CREATE OR REPLACE FUNCTION public.calculate_commission(
  p_amount numeric,
  p_rate numeric DEFAULT 0.1
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ROUND(p_amount * p_rate, 2)
$$;

-- Fix transfer_beans function
CREATE OR REPLACE FUNCTION public.transfer_beans(
  p_from_user uuid,
  p_to_user uuid,
  p_amount integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_balance integer;
BEGIN
  SELECT beans INTO v_from_balance
  FROM public.profiles
  WHERE id = p_from_user
  FOR UPDATE;
  
  IF v_from_balance < p_amount THEN
    RETURN false;
  END IF;
  
  UPDATE public.profiles SET beans = beans - p_amount WHERE id = p_from_user;
  UPDATE public.profiles SET beans = COALESCE(beans, 0) + p_amount WHERE id = p_to_user;
  
  RETURN true;
END;
$$;

-- Fix transfer_coins function
CREATE OR REPLACE FUNCTION public.transfer_coins(
  p_from_user uuid,
  p_to_user uuid,
  p_amount bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_balance bigint;
BEGIN
  SELECT coins INTO v_from_balance
  FROM public.profiles
  WHERE id = p_from_user
  FOR UPDATE;
  
  IF v_from_balance < p_amount THEN
    RETURN false;
  END IF;
  
  UPDATE public.profiles SET coins = coins - p_amount WHERE id = p_from_user;
  UPDATE public.profiles SET coins = COALESCE(coins, 0) + p_amount WHERE id = p_to_user;
  
  RETURN true;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.auto_process_live_game() TO service_role;
GRANT EXECUTE ON FUNCTION public.create_live_game_round(text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_level(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_beans(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_coins(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_beans(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_coins(uuid, uuid, bigint) TO authenticated;