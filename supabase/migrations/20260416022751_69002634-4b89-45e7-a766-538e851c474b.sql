CREATE OR REPLACE FUNCTION public.notify_payroll_helpers_on_agency_withdrawal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country_code text;
BEGIN
  IF NEW.payment_method = 'epay' THEN
    RETURN NEW;
  END IF;

  v_country_code := COALESCE(
    NEW.payment_details->>'country_code',
    NEW.country_code
  );

  IF v_country_code IS NULL OR btrim(v_country_code) = '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.helper_notifications (helper_id, type, title, message, data, is_read)
  SELECT
    th.id,
    'new_withdrawal_request',
    '💸 New Withdrawal Request!',
    format(
      'Agency "%s" requested $%s withdrawal (%s)',
      COALESCE(a.name, 'Agency'),
      COALESCE((NEW.payment_details->>'usd_amount'), COALESCE(NEW.usd_amount::text, '0')),
      upper(COALESCE(NEW.payment_method, 'local'))
    ),
    jsonb_build_object(
      'withdrawal_id', NEW.id,
      'agency_id', NEW.agency_id,
      'agency_name', COALESCE(a.name, 'Agency'),
      'amount_beans', NEW.amount,
      'amount_usd', COALESCE((NEW.payment_details->>'usd_amount')::numeric, NEW.usd_amount),
      'country_code', v_country_code,
      'payment_method', NEW.payment_method,
      'source', 'agency_withdrawal_trigger'
    ),
    false
  FROM public.topup_helpers th
  LEFT JOIN public.agencies a ON a.id = NEW.agency_id
  WHERE COALESCE(th.is_active, true) = true
    AND COALESCE(th.is_verified, false) = true
    AND COALESCE(th.payroll_enabled, false) = true
    AND th.trader_level = 5
    AND th.country_code = v_country_code;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_payroll_helpers_on_agency_withdrawal ON public.agency_withdrawals;
CREATE TRIGGER trg_notify_payroll_helpers_on_agency_withdrawal
AFTER INSERT ON public.agency_withdrawals
FOR EACH ROW
EXECUTE FUNCTION public.notify_payroll_helpers_on_agency_withdrawal();

GRANT EXECUTE ON FUNCTION public.notify_payroll_helpers_on_agency_withdrawal() TO authenticated;