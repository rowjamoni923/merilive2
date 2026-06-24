CREATE OR REPLACE FUNCTION public.admin_backfill_csa_bonuses(_country text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total int := 0;
  v_credited int := 0;
  w record;
  res jsonb;
BEGIN
  IF public.current_admin_id_from_header() IS NULL
     AND NOT public.has_role(auth.uid(), 'admin')
     AND COALESCE(auth.role(), '') <> 'service_role'
  THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  FOR w IN
    SELECT id FROM public.agency_withdrawals
    WHERE status = (SELECT bonus_trigger_status FROM public.csa_diamond_settings WHERE id = 1)
      AND (_country IS NULL OR country_code = _country)
  LOOP
    v_total := v_total + 1;
    res := public.award_csa_withdrawal_bonus(w.id);
    IF (res->>'credited')::boolean IS TRUE THEN
      v_credited := v_credited + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('scanned', v_total, 'credited', v_credited);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_credit_csa_diamonds(
  _purchase_id uuid,
  _gateway_ref text DEFAULT NULL,
  _gateway_payload jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p public.csa_diamond_purchases;
  v_balance bigint;
  v_actor_user_id uuid;
BEGIN
  IF public.current_admin_id_from_header() IS NULL
     AND NOT public.has_role(auth.uid(), 'admin')
     AND COALESCE(auth.role(), '') <> 'service_role'
  THEN
    RAISE EXCEPTION 'Admins/service only';
  END IF;

  IF public.current_admin_id_from_header() IS NOT NULL THEN
    SELECT user_id INTO v_actor_user_id
      FROM public.admin_users
     WHERE id = public.current_admin_id_from_header()
       AND is_active = true;
  ELSE
    v_actor_user_id := auth.uid();
  END IF;

  SELECT * INTO p FROM public.csa_diamond_purchases WHERE id = _purchase_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Purchase not found'; END IF;
  IF p.status = 'credited' THEN
    RETURN jsonb_build_object('already_credited', true, 'purchase_id', p.id);
  END IF;

  UPDATE public.country_super_admins
     SET diamond_balance = diamond_balance + p.diamonds_to_credit,
         total_purchased_diamonds = total_purchased_diamonds + p.diamonds_to_credit,
         updated_at = now()
   WHERE user_id = p.csa_user_id
   RETURNING diamond_balance INTO v_balance;

  UPDATE public.csa_diamond_purchases
     SET status = 'credited',
         credited_at = now(),
         credited_by = v_actor_user_id,
         paid_at = COALESCE(paid_at, now()),
         gateway_ref = COALESCE(_gateway_ref, gateway_ref),
         gateway_payload = COALESCE(_gateway_payload, gateway_payload),
         updated_at = now()
   WHERE id = p.id;

  INSERT INTO public.csa_diamond_ledger
    (csa_user_id, country_code, change_amount, balance_after, reason, related_purchase_id, notes)
  VALUES (p.csa_user_id, p.country_code, p.diamonds_to_credit, v_balance, 'purchase', p.id,
          'Auto-credited from ' || COALESCE(p.gateway,'gateway'));

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (p.csa_user_id, 'csa_diamonds_credited', 'Diamonds Credited',
          p.diamonds_to_credit || ' diamonds credited for $' || p.amount_usd || ' purchase.',
          jsonb_build_object('purchase_id', p.id, 'diamonds', p.diamonds_to_credit, 'amount_usd', p.amount_usd));

  RETURN jsonb_build_object('purchase_id', p.id, 'credited', p.diamonds_to_credit, 'balance_after', v_balance);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_backfill_csa_bonuses(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_credit_csa_diamonds(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_backfill_csa_bonuses(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_credit_csa_diamonds(uuid,text,jsonb) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';