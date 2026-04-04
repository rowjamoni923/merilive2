
-- Drop existing transfer_coins functions (multiple overloads)
DROP FUNCTION IF EXISTS public.transfer_coins(uuid, uuid, bigint);
DROP FUNCTION IF EXISTS public.transfer_coins(uuid, uuid, integer);

-- Recreate with auth checks
CREATE FUNCTION public.transfer_coins(p_sender_id uuid, p_receiver_id uuid, p_amount bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF auth.uid() != p_sender_id THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    UPDATE public.profiles 
    SET coins = coins - p_amount 
    WHERE id = p_sender_id AND coins >= p_amount;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Insufficient coins or sender not found';
    END IF;
    
    UPDATE public.profiles 
    SET coins = coins + p_amount 
    WHERE id = p_receiver_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Receiver not found';
    END IF;
END;
$$;
