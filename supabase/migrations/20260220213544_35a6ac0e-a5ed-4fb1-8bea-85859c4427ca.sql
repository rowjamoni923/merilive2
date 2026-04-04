CREATE OR REPLACE FUNCTION handle_reel_gift()
RETURNS TRIGGER AS $$
DECLARE
  host_share DECIMAL(5,2) := 0.55;
  beans_amount BIGINT;
BEGIN
  IF NEW.reel_id IS NOT NULL THEN
    beans_amount := FLOOR(NEW.coin_amount * host_share);
    
    -- Update reel beans_earned
    UPDATE public.reels 
    SET beans_earned = beans_earned + beans_amount
    WHERE id = NEW.reel_id;
    
    -- Also add to receiver's beans (correct column name)
    UPDATE public.profiles 
    SET beans = COALESCE(beans, 0) + beans_amount
    WHERE id = NEW.receiver_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;