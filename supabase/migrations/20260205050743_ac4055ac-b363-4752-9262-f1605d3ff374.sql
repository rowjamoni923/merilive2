-- Table for user beans to diamonds exchange tiers
-- Admin can define different rates for different beans amounts
CREATE TABLE IF NOT EXISTS public.user_beans_exchange_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  beans_amount INTEGER NOT NULL,
  diamonds_reward INTEGER NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_beans_exchange_tiers ENABLE ROW LEVEL SECURITY;

-- Public read access (users need to see exchange rates)
CREATE POLICY "Everyone can view active exchange tiers"
ON public.user_beans_exchange_tiers
FOR SELECT
USING (is_active = true);

-- Admin insert/update/delete policies
CREATE POLICY "Admins can manage exchange tiers"
ON public.user_beans_exchange_tiers
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = auth.uid() AND is_active = true
  )
);

-- Insert default tiers (100, 1000, 10000, 100000 beans)
INSERT INTO public.user_beans_exchange_tiers (beans_amount, diamonds_reward, display_order) VALUES
(100, 10, 1),
(1000, 100, 2),
(10000, 1000, 3),
(100000, 10000, 4);

-- Table for user beans exchange history
CREATE TABLE IF NOT EXISTS public.user_beans_exchange_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  beans_spent INTEGER NOT NULL,
  diamonds_received INTEGER NOT NULL,
  tier_id UUID REFERENCES public.user_beans_exchange_tiers(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_beans_exchange_history ENABLE ROW LEVEL SECURITY;

-- Users can view their own exchange history
CREATE POLICY "Users can view own exchange history"
ON public.user_beans_exchange_history
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own exchanges
CREATE POLICY "Users can create own exchanges"
ON public.user_beans_exchange_history
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_user_beans_exchange_history_user ON public.user_beans_exchange_history(user_id);
CREATE INDEX idx_user_beans_exchange_tiers_active ON public.user_beans_exchange_tiers(is_active, display_order);

-- RPC function for atomic beans to diamonds exchange
CREATE OR REPLACE FUNCTION public.exchange_user_beans_to_diamonds(
  _user_id UUID,
  _beans_amount INTEGER,
  _diamonds_reward INTEGER,
  _tier_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_beans INTEGER;
  current_coins INTEGER;
BEGIN
  -- Get current beans from gift_transactions sum
  SELECT COALESCE(SUM(coin_amount), 0) INTO current_beans
  FROM gift_transactions
  WHERE receiver_id = _user_id;
  
  -- Check if user has enough beans
  IF current_beans < _beans_amount THEN
    RAISE EXCEPTION 'Insufficient beans balance';
  END IF;
  
  -- Deduct beans by creating a negative gift transaction (internal exchange)
  INSERT INTO gift_transactions (
    sender_id, 
    receiver_id, 
    gift_id, 
    coin_amount, 
    room_id,
    created_at
  ) VALUES (
    _user_id,
    '00000000-0000-0000-0000-000000000000'::UUID, -- System account
    NULL,
    -_beans_amount, -- Negative to deduct
    NULL,
    now()
  );
  
  -- Add diamonds to user's coins using existing RPC
  PERFORM add_coins_to_user(_user_id, _diamonds_reward);
  
  -- Record the exchange
  INSERT INTO user_beans_exchange_history (user_id, beans_spent, diamonds_received, tier_id)
  VALUES (_user_id, _beans_amount, _diamonds_reward, _tier_id);
  
  RETURN TRUE;
END;
$$;