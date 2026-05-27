-- Pkg381: Finance Hub pass-1 gap closure
-- 1) admin_logs had admin-token table GRANTs but no anon/header-gated RLS path.
--    Admin panel uses anon key + x-admin-token, so Admin Logs and recent top-up history
--    silently failed through PostgREST even though SECDEF RPC logging worked.
DROP POLICY IF EXISTS "Admins can create logs" ON public.admin_logs;
DROP POLICY IF EXISTS "Admins can view logs" ON public.admin_logs;
DROP POLICY IF EXISTS admin_logs_admin_session_insert ON public.admin_logs;
DROP POLICY IF EXISTS admin_logs_admin_session_select ON public.admin_logs;

CREATE POLICY admin_logs_admin_session_select
ON public.admin_logs
FOR SELECT
TO anon, authenticated
USING (
  public.is_active_admin_owner_session()
  OR public.admin_has_any_section_permission(ARRAY[
    'analytics','finance-hub','manual-topup','topup-system','agency-management',
    'user-management','support','moderation','security'
  ], false)
  OR (is_real_user() AND public.is_admin(auth.uid()))
);

CREATE POLICY admin_logs_admin_session_insert
ON public.admin_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (
  admin_id = public.current_admin_id_from_header()
  AND public.admin_has_any_section_permission(ARRAY[
    'finance-hub','manual-topup','topup-system','agency-management',
    'user-management','support','moderation','security'
  ], true)
);

GRANT SELECT, INSERT ON public.admin_logs TO anon, authenticated;
GRANT ALL ON public.admin_logs TO service_role;

-- 2) admin_adjust_agency_commission used only is_active_admin_session(), so any active
--    sub-admin could manually add/subtract agency commission beans. Also make the agency
--    economy bypass balanced if an exception occurs.
CREATE OR REPLACE FUNCTION public.admin_adjust_agency_commission(
  _agency_id uuid,
  _delta_beans bigint,
  _reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _admin_id uuid := public.current_admin_id_from_header();
  _new_balance bigint;
  _row_id uuid;
BEGIN
  IF _admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session required');
  END IF;

  IF NOT public.admin_has_any_section_permission(
    ARRAY['finance-hub','agency-management','agency-commission','commissions'], true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Finance or agency commission edit permission required');
  END IF;

  IF _agency_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency is required');
  END IF;

  IF _delta_beans IS NULL OR _delta_beans = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Adjustment cannot be zero');
  END IF;

  IF abs(_delta_beans) > 10000000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount too large');
  END IF;

  IF _reason IS NULL OR length(btrim(_reason)) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'A reason is required (min 4 chars)');
  END IF;

  PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);

  UPDATE public.agencies
     SET beans_balance = GREATEST(COALESCE(beans_balance, 0) + _delta_beans, 0),
         updated_at = now()
   WHERE id = _agency_id
   RETURNING beans_balance INTO _new_balance;

  PERFORM set_config('app.bypass_agency_economy_guard', 'false', true);

  IF _new_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency not found');
  END IF;

  INSERT INTO public.agency_commission_history (
    agency_id, host_id, transaction_type, original_amount,
    commission_rate, commission_amount, notes, adjusted_by
  ) VALUES (
    _agency_id, NULL, 'manual_adjustment', abs(_delta_beans),
    0, _delta_beans, btrim(_reason), _admin_id
  ) RETURNING id INTO _row_id;

  BEGIN
    INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
    VALUES (
      _admin_id,
      CASE WHEN _delta_beans > 0 THEN 'agency_commission_add' ELSE 'agency_commission_deduct' END,
      'agency',
      _agency_id,
      jsonb_build_object('delta_beans', _delta_beans, 'new_balance', _new_balance, 'reason', btrim(_reason), 'row_id', _row_id)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'row_id', _row_id,
    'new_balance', _new_balance,
    'delta', _delta_beans
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.bypass_agency_economy_guard', 'false', true);
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_agency_commission(uuid, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_agency_commission(uuid, bigint, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.admin_adjust_agency_commission(uuid, bigint, text) IS
'Pkg381: Finance Hub pass-1. Manual agency commission +/- requires finance/agency edit permission and keeps agency economy bypass scoped safely.';