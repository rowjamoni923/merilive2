-- Create function to remove host from agency (admin only)
CREATE OR REPLACE FUNCTION public.admin_remove_host_from_agency(
  _host_id UUID,
  _reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agency_id UUID;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  -- Get the host's current agency
  SELECT agency_id INTO _agency_id
  FROM agency_hosts
  WHERE host_id = _host_id AND status = 'active';
  
  IF _agency_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Update agency_hosts status
  UPDATE agency_hosts
  SET status = 'removed', left_at = now()
  WHERE host_id = _host_id AND agency_id = _agency_id;
  
  -- Remove agency_id from profile
  UPDATE profiles
  SET agency_id = NULL
  WHERE id = _host_id;
  
  -- Decrement agency host count
  UPDATE agencies
  SET total_hosts = GREATEST(total_hosts - 1, 0)
  WHERE id = _agency_id;
  
  -- Log admin action
  PERFORM public.log_admin_action(
    'remove_host_from_agency',
    'host',
    _host_id,
    jsonb_build_object('agency_id', _agency_id, 'reason', _reason)
  );
  
  RETURN TRUE;
END;
$$;

-- Create function to add coins to agency wallet (admin only)
CREATE OR REPLACE FUNCTION public.admin_add_agency_coins(
  _agency_id UUID,
  _amount NUMERIC,
  _note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  -- Add coins to agency wallet
  UPDATE agencies
  SET wallet_balance = COALESCE(wallet_balance, 0) + _amount
  WHERE id = _agency_id;
  
  -- Log admin action
  PERFORM public.log_admin_action(
    'add_agency_coins',
    'agency',
    _agency_id,
    jsonb_build_object('amount', _amount, 'note', _note)
  );
  
  RETURN TRUE;
END;
$$;

-- Create function to update agency level (admin only)
CREATE OR REPLACE FUNCTION public.admin_update_agency_level(
  _agency_id UUID,
  _level TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  -- Update agency level
  UPDATE agencies
  SET level = _level
  WHERE id = _agency_id;
  
  -- Log admin action
  PERFORM public.log_admin_action(
    'update_agency_level',
    'agency',
    _agency_id,
    jsonb_build_object('new_level', _level)
  );
  
  RETURN TRUE;
END;
$$;

-- Create function to process agency withdrawal (admin only)
CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(
  _withdrawal_id UUID,
  _action TEXT, -- 'approve', 'reject', 'complete'
  _notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _withdrawal RECORD;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  -- Get withdrawal info
  SELECT * INTO _withdrawal
  FROM agency_withdrawals
  WHERE id = _withdrawal_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  IF _action = 'approve' THEN
    UPDATE agency_withdrawals
    SET status = 'approved', processed_at = now(), processed_by = auth.uid(), notes = _notes
    WHERE id = _withdrawal_id;
    
  ELSIF _action = 'reject' THEN
    -- Return money to agency wallet
    UPDATE agencies
    SET wallet_balance = wallet_balance + _withdrawal.amount
    WHERE id = _withdrawal.agency_id;
    
    UPDATE agency_withdrawals
    SET status = 'rejected', processed_at = now(), processed_by = auth.uid(), notes = _notes
    WHERE id = _withdrawal_id;
    
  ELSIF _action = 'complete' THEN
    UPDATE agency_withdrawals
    SET status = 'completed', processed_at = now(), processed_by = auth.uid(), notes = _notes
    WHERE id = _withdrawal_id;
  END IF;
  
  -- Log admin action
  PERFORM public.log_admin_action(
    'process_withdrawal',
    'withdrawal',
    _withdrawal_id,
    jsonb_build_object('action', _action, 'amount', _withdrawal.amount, 'notes', _notes)
  );
  
  RETURN TRUE;
END;
$$;

-- Add left_at column to agency_hosts if not exists
ALTER TABLE public.agency_hosts 
ADD COLUMN IF NOT EXISTS left_at TIMESTAMP WITH TIME ZONE;