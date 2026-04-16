
-- Create trigger function to notify same-country helpers on new agency withdrawal
CREATE OR REPLACE FUNCTION public.notify_helpers_on_agency_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _helper RECORD;
  _agency_name TEXT;
  _agency_country TEXT;
  _usd_amount NUMERIC;
BEGIN
  -- Only fire on new pending withdrawals, skip ePay (goes to admin)
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_method = 'epay' THEN
    RETURN NEW;
  END IF;

  -- Get agency info
  SELECT a.name, COALESCE(NEW.country_code, a.whatsapp_number) 
  INTO _agency_name, _agency_country
  FROM public.agencies a
  WHERE a.id = NEW.agency_id;

  -- Determine country from withdrawal or agency
  _agency_country := COALESCE(
    NEW.country_code,
    (NEW.payment_details->>'country_code')::TEXT
  );

  -- Calculate approximate USD
  _usd_amount := ROUND(NEW.amount / 9000.0, 2);

  -- Find all active, verified, payroll-enabled helpers in the same country
  FOR _helper IN
    SELECT th.id AS helper_id, th.user_id
    FROM public.topup_helpers th
    WHERE th.is_active = true
      AND th.is_verified = true
      AND th.payroll_enabled = true
      AND (
        _agency_country IS NULL 
        OR th.country_code = _agency_country
        OR _agency_country = ''
      )
  LOOP
    -- Insert into helper_notifications table
    INSERT INTO public.helper_notifications (helper_id, type, title, message, data)
    VALUES (
      _helper.helper_id,
      'new_withdrawal_request',
      '💰 New Agency Withdrawal Request',
      COALESCE(_agency_name, 'An agency') || ' requested $' || _usd_amount::TEXT || ' withdrawal. Tap to claim and process.',
      jsonb_build_object(
        'withdrawal_id', NEW.id,
        'agency_id', NEW.agency_id,
        'agency_name', _agency_name,
        'amount', NEW.amount,
        'usd_amount', _usd_amount,
        'payment_method', NEW.payment_method,
        'country_code', _agency_country
      )
    );

    -- Also send to regular notifications for the helper's user
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      _helper.user_id,
      'new_withdrawal_request',
      '💰 New Agency Withdrawal Request',
      COALESCE(_agency_name, 'An agency') || ' requested $' || _usd_amount::TEXT || ' withdrawal.',
      jsonb_build_object(
        'withdrawal_id', NEW.id,
        'agency_id', NEW.agency_id,
        'agency_name', _agency_name,
        'amount', NEW.amount,
        'usd_amount', _usd_amount,
        'action_url', '/helper-dashboard?tab=agency-withdrawals'
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Create trigger on agency_withdrawals table
DROP TRIGGER IF EXISTS trg_notify_helpers_on_withdrawal ON public.agency_withdrawals;

CREATE TRIGGER trg_notify_helpers_on_withdrawal
  AFTER INSERT ON public.agency_withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_helpers_on_agency_withdrawal();
