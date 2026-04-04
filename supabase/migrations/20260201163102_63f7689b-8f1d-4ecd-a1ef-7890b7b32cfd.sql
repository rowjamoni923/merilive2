-- Add beans_earned column to reels table
ALTER TABLE public.reels 
ADD COLUMN IF NOT EXISTS beans_earned BIGINT DEFAULT 0;

-- Add reel_id column to gift_transactions for Reel gifting
ALTER TABLE public.gift_transactions 
ADD COLUMN IF NOT EXISTS reel_id UUID REFERENCES public.reels(id) ON DELETE CASCADE;

-- Create index for reel gifts lookup
CREATE INDEX IF NOT EXISTS idx_gift_transactions_reel_id 
ON public.gift_transactions(reel_id) 
WHERE reel_id IS NOT NULL;

-- Create function to increment reel beans when gift is sent
CREATE OR REPLACE FUNCTION public.handle_reel_gift()
RETURNS TRIGGER AS $$
DECLARE
  host_share DECIMAL(5,2) := 0.55; -- 55% commission (from app_settings)
  beans_amount BIGINT;
BEGIN
  -- Only process if this is a reel gift
  IF NEW.reel_id IS NOT NULL THEN
    -- Calculate beans (55% of coin_amount)
    beans_amount := FLOOR(NEW.coin_amount * host_share);
    
    -- Update reel beans_earned
    UPDATE public.reels 
    SET beans_earned = beans_earned + beans_amount
    WHERE id = NEW.reel_id;
    
    -- Also add to receiver's beans balance
    UPDATE public.profiles 
    SET beans_balance = beans_balance + beans_amount
    WHERE id = NEW.receiver_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for reel gifts
DROP TRIGGER IF EXISTS on_reel_gift_trigger ON public.gift_transactions;
CREATE TRIGGER on_reel_gift_trigger
AFTER INSERT ON public.gift_transactions
FOR EACH ROW
WHEN (NEW.reel_id IS NOT NULL)
EXECUTE FUNCTION public.handle_reel_gift();

-- Add policy for users to delete their own reels
DROP POLICY IF EXISTS "Users can delete own reels" ON public.reels;
CREATE POLICY "Users can delete own reels" ON public.reels
FOR DELETE USING (auth.uid() = user_id);