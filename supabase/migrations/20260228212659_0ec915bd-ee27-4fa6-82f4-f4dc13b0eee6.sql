
-- Update trigger to also handle completed orders (instant processing)
CREATE OR REPLACE FUNCTION public.notify_helper_on_new_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_name TEXT;
  v_currency_symbol TEXT;
  v_title TEXT;
  v_message TEXT;
  v_type TEXT;
BEGIN
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

  IF NEW.status = 'pending' THEN
    v_type := 'new_topup_order';
    v_title := '💎 New Top-up Order!';
    v_message := format('New order from %s: %s diamonds (%s%s)', 
      COALESCE(v_user_name, 'User'), 
      NEW.coin_amount, 
      v_currency_symbol,
      ROUND(NEW.amount_local::numeric, 2)
    );
  ELSIF NEW.status = 'completed' THEN
    v_type := 'order_completed';
    v_title := '💰 New Sale!';
    v_message := format('You sold %s diamonds. %s diamonds deducted from your wallet.', 
      NEW.coin_amount, NEW.coin_amount
    );
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO helper_notifications (
    helper_id, type, title, message, data, is_read
  ) VALUES (
    NEW.helper_id,
    v_type,
    v_title,
    v_message,
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
  
  RETURN NEW;
END;
$$;
