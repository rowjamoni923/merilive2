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
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_method = 'epay' THEN
    RETURN NEW;
  END IF;

  SELECT a.name
  INTO _agency_name
  FROM public.agencies a
  WHERE a.id = NEW.agency_id;

  _agency_country := COALESCE(
    NEW.country_code,
    NEW.payment_details->>'country_code'
  );

  IF _agency_country IS NULL OR btrim(_agency_country) = '' THEN
    RETURN NEW;
  END IF;

  _usd_amount := ROUND(NEW.amount / 9000.0, 2);

  FOR _helper IN
    SELECT th.id AS helper_id, th.user_id
    FROM public.topup_helpers th
    WHERE th.is_active = true
      AND th.is_verified = true
      AND th.payroll_enabled = true
      AND th.trader_level = 5
      AND th.country_code = _agency_country
  LOOP
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
        'country_code', _agency_country,
        'source', 'agency_withdrawal_trigger'
      )
    );

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
        'country_code', _agency_country,
        'action_url', '/helper-dashboard?tab=agency-withdrawals',
        'source', 'agency_withdrawal_trigger'
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;