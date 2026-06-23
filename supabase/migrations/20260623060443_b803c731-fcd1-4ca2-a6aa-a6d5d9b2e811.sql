
ALTER TABLE public.helper_withdrawal_requests
  ADD COLUMN IF NOT EXISTS country_admin_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS country_admin_reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS country_admin_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS country_admin_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_hwr_country_admin_status
  ON public.helper_withdrawal_requests(country_admin_status, status);

ALTER TABLE public.agency_withdrawals
  ADD COLUMN IF NOT EXISTS country_admin_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS country_admin_reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS country_admin_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS country_admin_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_aw_country_admin_status
  ON public.agency_withdrawals(country_admin_status, status);

CREATE OR REPLACE FUNCTION public.country_admin_review_helper_withdrawal(
  _request_id UUID,
  _decision TEXT,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_country TEXT;
  v_status TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'invalid_decision'; END IF;

  SELECT hwr.status, th.country_code
    INTO v_status, v_country
  FROM public.helper_withdrawal_requests hwr
  JOIN public.topup_helpers th ON th.id = hwr.helper_id
  WHERE hwr.id = _request_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.country_payroll_admins
    WHERE user_id = v_caller AND country_code = v_country AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'not_country_admin_for_country';
  END IF;

  IF v_status NOT IN ('pending','screenshot_submitted') THEN
    RAISE EXCEPTION 'request_not_reviewable';
  END IF;

  UPDATE public.helper_withdrawal_requests
     SET country_admin_status      = _decision,
         country_admin_reviewed_by = v_caller,
         country_admin_reviewed_at = now(),
         country_admin_notes       = _notes,
         updated_at                = now()
   WHERE id = _request_id;

  INSERT INTO public.country_payroll_admin_audit(
    payroll_admin_id, action, target_kind, target_id, country_code, details
  )
  SELECT cpa.id, 'review_helper_withdrawal_' || _decision,
         'helper_withdrawal_request', _request_id, v_country,
         jsonb_build_object('notes', _notes)
  FROM public.country_payroll_admins cpa
  WHERE cpa.user_id = v_caller AND cpa.country_code = v_country
  LIMIT 1;

  RETURN jsonb_build_object('success', true, 'decision', _decision);
END;
$$;

GRANT EXECUTE ON FUNCTION public.country_admin_review_helper_withdrawal(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.country_admin_review_agency_withdrawal(
  _request_id UUID,
  _decision TEXT,
  _notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_country TEXT;
  v_status TEXT;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'invalid_decision'; END IF;

  SELECT aw.status, p.country_code
    INTO v_status, v_country
  FROM public.agency_withdrawals aw
  JOIN public.agencies a ON a.id = aw.agency_id
  JOIN public.profiles p ON p.id = a.owner_id
  WHERE aw.id = _request_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.country_payroll_admins
    WHERE user_id = v_caller AND country_code = v_country AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'not_country_admin_for_country';
  END IF;

  IF v_status NOT IN ('pending','screenshot_submitted') THEN
    RAISE EXCEPTION 'request_not_reviewable';
  END IF;

  UPDATE public.agency_withdrawals
     SET country_admin_status      = _decision,
         country_admin_reviewed_by = v_caller,
         country_admin_reviewed_at = now(),
         country_admin_notes       = _notes,
         updated_at                = now()
   WHERE id = _request_id;

  INSERT INTO public.country_payroll_admin_audit(
    payroll_admin_id, action, target_kind, target_id, country_code, details
  )
  SELECT cpa.id, 'review_agency_withdrawal_' || _decision,
         'agency_withdrawal', _request_id, v_country,
         jsonb_build_object('notes', _notes)
  FROM public.country_payroll_admins cpa
  WHERE cpa.user_id = v_caller AND cpa.country_code = v_country
  LIMIT 1;

  RETURN jsonb_build_object('success', true, 'decision', _decision);
END;
$$;

GRANT EXECUTE ON FUNCTION public.country_admin_review_agency_withdrawal(UUID, TEXT, TEXT) TO authenticated;

DROP POLICY IF EXISTS "country_admin_read_helper_withdrawals" ON public.helper_withdrawal_requests;
CREATE POLICY "country_admin_read_helper_withdrawals"
ON public.helper_withdrawal_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    JOIN public.country_payroll_admins cpa
      ON cpa.country_code = th.country_code
     AND cpa.status = 'active'
    WHERE th.id = helper_withdrawal_requests.helper_id
      AND cpa.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "country_admin_read_agency_withdrawals" ON public.agency_withdrawals;
CREATE POLICY "country_admin_read_agency_withdrawals"
ON public.agency_withdrawals
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.agencies a
    JOIN public.profiles p ON p.id = a.owner_id
    JOIN public.country_payroll_admins cpa
      ON cpa.country_code = p.country_code
     AND cpa.status = 'active'
    WHERE a.id = agency_withdrawals.agency_id
      AND cpa.user_id = auth.uid()
  )
);
