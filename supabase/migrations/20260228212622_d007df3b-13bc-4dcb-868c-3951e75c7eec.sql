
-- Fix: Allow authenticated users to insert helper notifications
-- This is needed because when a user creates a recharge order, 
-- the notification to the helper fails silently due to RLS

-- Option 1: Create a SECURITY DEFINER trigger on helper_orders
-- This automatically notifies the helper when a new pending order is created

CREATE OR REPLACE FUNCTION public.notify_helper_on_new_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_name TEXT;
  v_currency_symbol TEXT;
BEGIN
  -- Only trigger for new pending orders
  IF NEW.status = 'pending' THEN
    -- Get user display name
    SELECT display_name INTO v_user_name 
    FROM profiles WHERE id = NEW.user_id;
    
    -- Get currency symbol
    SELECT currency_symbol INTO v_currency_symbol
    FROM currency_rates WHERE currency_code = NEW.currency_code
    LIMIT 1;
    
    IF v_currency_symbol IS NULL THEN
      v_currency_symbol := '$';
    END IF;
    
    -- Insert notification for the helper (bypasses RLS via SECURITY DEFINER)
    INSERT INTO helper_notifications (
      helper_id,
      type,
      title,
      message,
      data,
      is_read
    ) VALUES (
      NEW.helper_id,
      'new_topup_order',
      '💎 New Top-up Order!',
      format('New order from %s: %s diamonds (%s%s)', 
        COALESCE(v_user_name, 'User'), 
        NEW.coin_amount, 
        v_currency_symbol,
        ROUND(NEW.amount_local::numeric, 2)
      ),
      jsonb_build_object(
        'order_id', NEW.id,
        'coins', NEW.coin_amount,
        'amount_local', NEW.amount_local,
        'amount_usd', NEW.amount_usd,
        'payment_method', NEW.payment_method,
        'user_id', NEW.user_id
      ),
      false
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_notify_helper_on_new_order ON helper_orders;
CREATE TRIGGER trigger_notify_helper_on_new_order
  AFTER INSERT ON helper_orders
  FOR EACH ROW
  EXECUTE FUNCTION notify_helper_on_new_order();
