
-- Atomic function to spin the roulette wheel (prevents multiple spins)
CREATE OR REPLACE FUNCTION public.roulette_spin_wheel(p_session_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _session RECORD;
  _winning_number INT;
BEGIN
  -- Lock the row and only transition if still in 'betting' status
  SELECT * INTO _session 
  FROM roulette_sessions 
  WHERE id = p_session_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'session_not_found');
  END IF;

  -- Already spinning or completed - ignore duplicate calls
  IF _session.status != 'betting' THEN
    RETURN jsonb_build_object('success', true, 'already_processed', true, 'winning_number', _session.winning_number);
  END IF;

  _winning_number := floor(random() * 37)::int;

  UPDATE roulette_sessions 
  SET status = 'spinning', winning_number = _winning_number
  WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true, 'winning_number', _winning_number);
END;
$$;

-- Atomic function to complete a roulette session
CREATE OR REPLACE FUNCTION public.roulette_complete_session(p_session_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _session RECORD;
BEGIN
  SELECT * INTO _session 
  FROM roulette_sessions 
  WHERE id = p_session_id 
  FOR UPDATE;

  IF NOT FOUND OR _session.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;

  UPDATE roulette_sessions 
  SET status = 'completed', completed_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Atomic function to get or create a betting session (prevents duplicates)
CREATE OR REPLACE FUNCTION public.roulette_get_or_create_session(p_duration_seconds INT DEFAULT 25)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _session RECORD;
  _new_id UUID;
  _betting_ends_at TIMESTAMPTZ;
BEGIN
  -- Find active session
  SELECT * INTO _session 
  FROM roulette_sessions 
  WHERE status IN ('betting', 'spinning')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- Check if stale (betting ended more than 60s ago)
    IF _session.betting_ends_at IS NOT NULL 
       AND _session.betting_ends_at < now() - interval '60 seconds' THEN
      -- Mark stale as completed
      UPDATE roulette_sessions 
      SET status = 'completed', completed_at = now(), 
          winning_number = COALESCE(winning_number, floor(random() * 37)::int)
      WHERE id = _session.id;
    ELSE
      -- Return existing active session
      RETURN jsonb_build_object(
        'success', true, 
        'session_id', _session.id,
        'status', _session.status,
        'winning_number', _session.winning_number,
        'betting_ends_at', _session.betting_ends_at,
        'created', false
      );
    END IF;
  END IF;

  -- Clean up any other stale sessions
  UPDATE roulette_sessions 
  SET status = 'completed', completed_at = now(),
      winning_number = COALESCE(winning_number, floor(random() * 37)::int)
  WHERE status IN ('betting', 'spinning')
    AND betting_ends_at < now() - interval '60 seconds';

  -- Create new session
  _new_id := gen_random_uuid();
  _betting_ends_at := now() + (p_duration_seconds || ' seconds')::interval;

  INSERT INTO roulette_sessions (id, status, betting_ends_at)
  VALUES (_new_id, 'betting', _betting_ends_at);

  RETURN jsonb_build_object(
    'success', true,
    'session_id', _new_id,
    'status', 'betting',
    'winning_number', NULL,
    'betting_ends_at', _betting_ends_at,
    'created', true
  );
END;
$$;
