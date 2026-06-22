
CREATE OR REPLACE FUNCTION public.get_user_country_code(_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(country_code,'') FROM public.profiles WHERE id = _user_id LIMIT 1
$$;

-- Helper withdrawal commission trigger
CREATE OR REPLACE FUNCTION public.trg_helper_withdrawal_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_country text;
  v_amount_usd numeric;
BEGIN
  IF NEW.status NOT IN ('completed','paid','approved') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  v_country := COALESCE(NEW.currency_code, public.get_user_country_code(NEW.helper_id), public.get_user_country_code(NEW.host_id));
  IF v_country IS NULL THEN RETURN NEW; END IF;

  v_amount_usd := COALESCE(NEW.usd_amount, 0);
  IF v_amount_usd <= 0 THEN RETURN NEW; END IF;

  PERFORM public.credit_country_payroll_commission(
    'helper_withdrawal', NEW.id, v_country, v_amount_usd
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_helper_withdrawal_commission ON public.helper_withdrawal_requests;
CREATE TRIGGER trg_helper_withdrawal_commission
AFTER UPDATE ON public.helper_withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_helper_withdrawal_commission();

-- Agency withdrawal commission trigger
CREATE OR REPLACE FUNCTION public.trg_agency_withdrawal_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_country text;
  v_amount_usd numeric;
BEGIN
  IF NEW.status NOT IN ('completed','paid','approved') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  BEGIN
    v_country := to_jsonb(NEW)->>'country_code';
  EXCEPTION WHEN OTHERS THEN v_country := NULL; END;

  IF v_country IS NULL THEN RETURN NEW; END IF;

  BEGIN
    v_amount_usd := COALESCE((to_jsonb(NEW)->>'usd_amount')::numeric, (to_jsonb(NEW)->>'amount_usd')::numeric, 0);
  EXCEPTION WHEN OTHERS THEN v_amount_usd := 0; END;

  IF v_amount_usd <= 0 THEN RETURN NEW; END IF;

  PERFORM public.credit_country_payroll_commission(
    'agency_withdrawal', NEW.id, v_country, v_amount_usd
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_agency_withdrawal_commission ON public.agency_withdrawals;
CREATE TRIGGER trg_agency_withdrawal_commission
AFTER UPDATE ON public.agency_withdrawals
FOR EACH ROW EXECUTE FUNCTION public.trg_agency_withdrawal_commission();
