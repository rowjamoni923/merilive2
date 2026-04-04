-- Create coin_transfers table for agency to user transfers
CREATE TABLE public.coin_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL,
  sender_type TEXT NOT NULL DEFAULT 'agency' CHECK (sender_type IN ('agency', 'admin')),
  receiver_id UUID NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.coin_transfers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own transfers"
ON public.coin_transfers
FOR SELECT
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Agency owners can create transfers"
ON public.coin_transfers
FOR INSERT
WITH CHECK (auth.uid() = sender_id);

-- Enable realtime
ALTER TABLE public.coin_transfers REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.coin_transfers;

-- Create RPC function to search users by ID or username
CREATE OR REPLACE FUNCTION public.search_user_by_id(_search_query TEXT)
RETURNS TABLE(
  id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  is_host BOOLEAN,
  is_verified BOOLEAN
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.is_host,
    p.is_verified
  FROM public.profiles p
  WHERE 
    p.id::text ILIKE '%' || _search_query || '%'
    OR p.username ILIKE '%' || _search_query || '%'
    OR p.display_name ILIKE '%' || _search_query || '%'
  LIMIT 10;
$$;

-- Create RPC function to transfer coins from agency to user
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
BEGIN
  _sender_id := auth.uid();
  
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

-- Create function to get transfer history for agency owner
CREATE OR REPLACE FUNCTION public.get_agency_transfer_history(_limit INTEGER DEFAULT 50)
RETURNS TABLE(
  id UUID,
  receiver_id UUID,
  receiver_name TEXT,
  receiver_avatar TEXT,
  amount INTEGER,
  note TEXT,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    ct.id,
    ct.receiver_id,
    p.display_name as receiver_name,
    p.avatar_url as receiver_avatar,
    ct.amount,
    ct.note,
    ct.status,
    ct.created_at
  FROM public.coin_transfers ct
  LEFT JOIN public.profiles p ON ct.receiver_id = p.id
  WHERE ct.sender_id = auth.uid()
  ORDER BY ct.created_at DESC
  LIMIT _limit;
$$;