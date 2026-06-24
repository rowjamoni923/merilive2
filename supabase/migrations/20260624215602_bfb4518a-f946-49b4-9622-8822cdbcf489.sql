DROP FUNCTION IF EXISTS public.admin_upsert_csa_diamond_settings(numeric,numeric,bigint,boolean,boolean,text);

CREATE OR REPLACE FUNCTION public.admin_upsert_csa_diamond_settings(
  _min_purchase_usd numeric,
  _diamonds_per_usd numeric,
  _visibility_threshold_diamonds bigint,
  _owner_fallback_enabled boolean,
  _auto_credit_on_payment boolean,
  _notes text DEFAULT NULL,
  _withdrawal_bonus_rate_percent numeric DEFAULT NULL,
  _withdrawal_bonus_enabled boolean DEFAULT NULL,
  _bonus_trigger_status text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid;
  v_admin_user_id uuid;
BEGIN
  v_admin_id := public.current_admin_id_from_header();

  IF v_admin_id IS NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  IF v_admin_id IS NOT NULL THEN
    SELECT user_id
      INTO v_admin_user_id
      FROM public.admin_users
     WHERE id = v_admin_id
       AND is_active = true;
  ELSE
    v_admin_user_id := auth.uid();
  END IF;

  IF _min_purchase_usd <= 0
     OR _diamonds_per_usd <= 0
     OR _visibility_threshold_diamonds < 0
     OR COALESCE(_withdrawal_bonus_rate_percent, 0) < 0
     OR COALESCE(_withdrawal_bonus_rate_percent, 0) > 100
  THEN
    RAISE EXCEPTION 'Invalid values';
  END IF;

  UPDATE public.csa_diamond_settings
     SET min_purchase_usd = _min_purchase_usd,
         diamonds_per_usd = _diamonds_per_usd,
         visibility_threshold_diamonds = _visibility_threshold_diamonds,
         owner_fallback_enabled = _owner_fallback_enabled,
         auto_credit_on_payment = _auto_credit_on_payment,
         withdrawal_bonus_rate_percent = COALESCE(_withdrawal_bonus_rate_percent, withdrawal_bonus_rate_percent),
         withdrawal_bonus_enabled = COALESCE(_withdrawal_bonus_enabled, withdrawal_bonus_enabled),
         bonus_trigger_status = COALESCE(NULLIF(trim(_bonus_trigger_status), ''), bonus_trigger_status),
         notes = _notes,
         updated_by = v_admin_user_id,
         updated_at = now()
   WHERE id = 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_upsert_csa_diamond_settings(numeric,numeric,bigint,boolean,boolean,text,numeric,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_csa_diamond_settings(numeric,numeric,bigint,boolean,boolean,text,numeric,boolean,text) TO authenticated, service_role, anon;

NOTIFY pgrst, 'reload schema';