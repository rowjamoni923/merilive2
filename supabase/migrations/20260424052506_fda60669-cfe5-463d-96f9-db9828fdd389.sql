-- 0) Fix banned_devices schema so existing triggers work
ALTER TABLE public.banned_devices
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_banned_devices_updated_at ON public.banned_devices;
CREATE OR REPLACE FUNCTION public.set_banned_devices_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_banned_devices_updated_at
BEFORE UPDATE ON public.banned_devices
FOR EACH ROW EXECUTE FUNCTION public.set_banned_devices_updated_at();

-- 1) Harden trigger function (search_path)
CREATE OR REPLACE FUNCTION public.auto_ban_device_on_profile_block()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_blocked = true AND (OLD.is_blocked IS DISTINCT FROM true) THEN
    IF NEW.device_id IS NOT NULL THEN
      INSERT INTO public.banned_devices (device_id, user_id, reason, banned_by, is_active, banned_at, updated_at)
      VALUES (NEW.device_id, NEW.id,
              COALESCE(NEW.blocked_reason, 'Account blocked for security violations'),
              auth.uid(), true, now(), now())
      ON CONFLICT (device_id) DO UPDATE
      SET is_active = true, user_id = EXCLUDED.user_id,
          reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by,
          banned_at = now(), updated_at = now();
    END IF;
  END IF;
  RETURN NEW;
END; $$;

-- 2) 3-step permanent ban tables
CREATE TABLE IF NOT EXISTS public.admin_permanent_ban_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL,
  initiated_by UUID NOT NULL,
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  include_gift_links BOOLEAN NOT NULL DEFAULT true,
  lookback_days INTEGER NOT NULL DEFAULT 90,
  linked_target_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'step1_created',
  review_note TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  executed_by UUID,
  executed_at TIMESTAMPTZ,
  execution_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_permanent_ban_case_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.admin_permanent_ban_cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  source TEXT NOT NULL,
  relation_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_apb_cases_target ON public.admin_permanent_ban_cases(target_user_id);
CREATE INDEX IF NOT EXISTS idx_apb_cases_status ON public.admin_permanent_ban_cases(status);
CREATE INDEX IF NOT EXISTS idx_apb_targets_case ON public.admin_permanent_ban_case_targets(case_id);
CREATE INDEX IF NOT EXISTS idx_apb_targets_user ON public.admin_permanent_ban_case_targets(user_id);

ALTER TABLE public.admin_permanent_ban_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permanent_ban_case_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view permanent ban cases" ON public.admin_permanent_ban_cases;
CREATE POLICY "Admins view permanent ban cases" ON public.admin_permanent_ban_cases
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins create permanent ban cases" ON public.admin_permanent_ban_cases;
CREATE POLICY "Admins create permanent ban cases" ON public.admin_permanent_ban_cases
FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners update permanent ban cases" ON public.admin_permanent_ban_cases;
CREATE POLICY "Owners update permanent ban cases" ON public.admin_permanent_ban_cases
FOR UPDATE TO authenticated
USING (public.is_owner(auth.uid())) WITH CHECK (public.is_owner(auth.uid()));

DROP POLICY IF EXISTS "Admins view permanent ban targets" ON public.admin_permanent_ban_case_targets;
CREATE POLICY "Admins view permanent ban targets" ON public.admin_permanent_ban_case_targets
FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "No direct permanent ban target writes" ON public.admin_permanent_ban_case_targets;
CREATE POLICY "No direct permanent ban target writes" ON public.admin_permanent_ban_case_targets
FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.set_admin_permanent_ban_case_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_admin_permanent_ban_cases_updated_at ON public.admin_permanent_ban_cases;
CREATE TRIGGER trg_admin_permanent_ban_cases_updated_at
BEFORE UPDATE ON public.admin_permanent_ban_cases
FOR EACH ROW EXECUTE FUNCTION public.set_admin_permanent_ban_case_updated_at();

-- 3) Resolve linked targets (primary + gift partners), excluding active admins/owners
CREATE OR REPLACE FUNCTION public.admin_resolve_permanent_ban_targets(_target_user_id UUID, _lookback_days INTEGER DEFAULT 90)
RETURNS TABLE(user_id UUID, source TEXT, relation_details JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH safe_window AS (SELECT GREATEST(COALESCE(_lookback_days, 90), 1) AS lookback_days),
  gift_links AS (
    SELECT
      CASE WHEN gt.sender_id = _target_user_id THEN gt.receiver_id ELSE gt.sender_id END AS linked_user_id,
      COUNT(*)::INTEGER AS gift_count,
      SUM(COALESCE(gt.diamond_cost, gt.coin_amount, gt.coin_cost, gt.coin_value, 0))::NUMERIC AS total_value,
      MAX(gt.created_at) AS last_gift_at
    FROM public.gift_transactions gt
    CROSS JOIN safe_window sw
    WHERE (gt.sender_id = _target_user_id OR gt.receiver_id = _target_user_id)
      AND gt.created_at >= now() - make_interval(days => sw.lookback_days)
      AND CASE WHEN gt.sender_id = _target_user_id THEN gt.receiver_id ELSE gt.sender_id END IS NOT NULL
      AND CASE WHEN gt.sender_id = _target_user_id THEN gt.receiver_id ELSE gt.sender_id END <> _target_user_id
    GROUP BY 1
  )
  SELECT _target_user_id, 'primary'::TEXT,
         jsonb_build_object('lookback_days', (SELECT lookback_days FROM safe_window))
  UNION ALL
  SELECT gl.linked_user_id, 'gift_link'::TEXT,
         jsonb_build_object('gift_count', gl.gift_count, 'total_value', gl.total_value,
                            'last_gift_at', gl.last_gift_at,
                            'lookback_days', (SELECT lookback_days FROM safe_window))
  FROM gift_links gl
  JOIN public.profiles p ON p.id = gl.linked_user_id
  WHERE NOT EXISTS (SELECT 1 FROM public.admin_users au
                    WHERE au.user_id = gl.linked_user_id AND au.is_active = true);
$$;

-- 4) Step 1: Admin creates ban case
CREATE OR REPLACE FUNCTION public.admin_permanent_ban_step_one(
  _target_user_id UUID, _reason TEXT, _evidence JSONB DEFAULT '[]'::jsonb,
  _include_gift_links BOOLEAN DEFAULT true, _lookback_days INTEGER DEFAULT 90)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case_id UUID; v_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can start permanent ban cases';
  END IF;
  IF _target_user_id IS NULL THEN RAISE EXCEPTION 'Target user is required'; END IF;
  IF COALESCE(trim(_reason), '') = '' THEN RAISE EXCEPTION 'Reason is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = _target_user_id AND au.is_active = true) THEN
    RAISE EXCEPTION 'Active admin/owner accounts cannot be targeted by permanent bans';
  END IF;

  INSERT INTO public.admin_permanent_ban_cases (
    target_user_id, initiated_by, reason, evidence, include_gift_links, lookback_days, status)
  VALUES (_target_user_id, auth.uid(), trim(_reason), COALESCE(_evidence, '[]'::jsonb),
          COALESCE(_include_gift_links, true), GREATEST(COALESCE(_lookback_days, 90), 1), 'step1_created')
  RETURNING id INTO v_case_id;

  INSERT INTO public.admin_permanent_ban_case_targets (case_id, user_id, source, relation_details)
  SELECT v_case_id, t.user_id, t.source, t.relation_details
  FROM public.admin_resolve_permanent_ban_targets(_target_user_id, GREATEST(COALESCE(_lookback_days, 90), 1)) t
  WHERE _include_gift_links = true OR t.source = 'primary';

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.admin_permanent_ban_case_targets WHERE case_id = v_case_id;

  UPDATE public.admin_permanent_ban_cases SET linked_target_count = v_count WHERE id = v_case_id;

  INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (auth.uid(), 'permanent_ban_step1_created', 'profile', _target_user_id::TEXT,
          jsonb_build_object('case_id', v_case_id, 'linked_target_count', v_count,
                             'include_gift_links', COALESCE(_include_gift_links, true),
                             'lookback_days', GREATEST(COALESCE(_lookback_days, 90), 1)));
  RETURN v_case_id;
END; $$;

-- 5) Step 2: Owner approves
CREATE OR REPLACE FUNCTION public.admin_permanent_ban_step_two(_case_id UUID, _review_note TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_case public.admin_permanent_ban_cases%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Only owners can approve permanent ban step 2';
  END IF;
  SELECT * INTO v_case FROM public.admin_permanent_ban_cases WHERE id = _case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Permanent ban case not found'; END IF;
  IF v_case.status <> 'step1_created' THEN RAISE EXCEPTION 'Case is not ready for step 2'; END IF;

  UPDATE public.admin_permanent_ban_cases
  SET status = 'step2_approved', reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = NULLIF(trim(COALESCE(_review_note, '')), '')
  WHERE id = _case_id;

  INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (auth.uid(), 'permanent_ban_step2_approved', 'profile', v_case.target_user_id::TEXT,
          jsonb_build_object('case_id', _case_id));
  RETURN jsonb_build_object('case_id', _case_id, 'status', 'step2_approved',
                            'linked_target_count', v_case.linked_target_count);
END; $$;

-- 6) Step 3: Owner executes
CREATE OR REPLACE FUNCTION public.admin_permanent_ban_step_three(_case_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_case public.admin_permanent_ban_cases%ROWTYPE;
  v_target RECORD;
  v_affected UUID[] := ARRAY[]::UUID[];
  v_summary JSONB;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_owner(auth.uid()) THEN
    RAISE EXCEPTION 'Only owners can execute permanent ban step 3';
  END IF;
  SELECT * INTO v_case FROM public.admin_permanent_ban_cases WHERE id = _case_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Permanent ban case not found'; END IF;
  IF v_case.status <> 'step2_approved' THEN
    RAISE EXCEPTION 'Case must complete step 2 before execution';
  END IF;

  FOR v_target IN
    SELECT user_id, source FROM public.admin_permanent_ban_case_targets WHERE case_id = _case_id
  LOOP
    UPDATE public.profiles
    SET is_blocked = true, is_online = false,
        blocked_at = COALESCE(blocked_at, now()),
        blocked_reason = CONCAT('Permanent ban • ', v_case.reason)
    WHERE id = v_target.user_id;

    UPDATE public.live_bans
    SET is_active = false, unbanned_by = auth.uid(), unbanned_at = now(),
        unban_reason = CONCAT('Superseded by permanent ban case ', _case_id::TEXT)
    WHERE user_id = v_target.user_id AND is_active = true;

    INSERT INTO public.live_bans (
      user_id, banned_by, reason, ban_type, ban_duration_hours, expires_at,
      is_active, ban_reason, violation_type, warning_count, ban_start, ban_end, auto_banned)
    VALUES (
      v_target.user_id, auth.uid(), v_case.reason, 'permanent', NULL, NULL, true,
      v_case.reason,
      CASE WHEN v_target.source = 'primary' THEN 'permanent_ban_primary' ELSE 'permanent_ban_gift_link' END,
      0, now(), NULL, false);

    UPDATE public.agency_hosts
    SET status = 'banned', left_at = COALESCE(left_at, now())
    WHERE host_id = v_target.user_id AND COALESCE(status, 'active') = 'active';

    v_affected := array_append(v_affected, v_target.user_id);
  END LOOP;

  v_summary := jsonb_build_object('affected_users', v_affected,
                                  'affected_count', COALESCE(array_length(v_affected, 1), 0),
                                  'executed_at', now());

  UPDATE public.admin_permanent_ban_cases
  SET status = 'step3_executed', executed_by = auth.uid(), executed_at = now(), execution_summary = v_summary
  WHERE id = _case_id;

  INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
  VALUES (auth.uid(), 'permanent_ban_step3_executed', 'profile', v_case.target_user_id::TEXT,
          jsonb_build_object('case_id', _case_id, 'summary', v_summary));
  RETURN v_summary;
END; $$;

-- 7) Sub-Admin list RPC
CREATE OR REPLACE FUNCTION public.admin_list_admin_users(_include_inactive BOOLEAN DEFAULT true)
RETURNS TABLE (
  id UUID, user_id UUID, email TEXT, display_name TEXT, normalized_display_name TEXT,
  role TEXT, is_active BOOLEAN, invited_at TIMESTAMPTZ, accepted_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ, created_at TIMESTAMPTZ
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can list admin users';
  END IF;
  RETURN QUERY
  SELECT au.id, au.user_id, au.email, au.display_name,
    COALESCE(NULLIF(trim(COALESCE(au.display_name, '')), ''),
             CASE WHEN au.role = 'owner' THEN 'Owner'
                  ELSE split_part(COALESCE(au.email, 'sub-admin'), '@', 1) END),
    au.role::TEXT, COALESCE(au.is_active, false),
    au.invited_at, au.accepted_at, au.last_login_at, au.created_at
  FROM public.admin_users au
  WHERE (_include_inactive OR COALESCE(au.is_active, false) = true)
    AND NOT (au.role = 'owner' AND au.user_id IS NULL
             AND lower(COALESCE(au.email, '')) = 'owner@merilive.com')
  ORDER BY CASE WHEN au.role = 'owner' THEN 0 ELSE 1 END, au.created_at DESC NULLS LAST;
END; $$;

-- 8) Helper Orders list RPC
CREATE OR REPLACE FUNCTION public.admin_list_helper_orders(
  _status TEXT DEFAULT NULL, _search TEXT DEFAULT NULL, _limit INTEGER DEFAULT 500)
RETURNS TABLE (
  id UUID, helper_id UUID, user_id UUID, customer_id UUID,
  coin_amount INTEGER, amount_usd NUMERIC, amount_local NUMERIC,
  currency_code TEXT, payment_method TEXT, status TEXT,
  user_payment_proof TEXT, helper_notes TEXT, processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ, user_country_code TEXT,
  helper_user_id UUID, helper_wallet_balance NUMERIC,
  helper_display_name TEXT, helper_avatar_url TEXT, helper_app_uid TEXT,
  customer_display_name TEXT, customer_avatar_url TEXT, customer_app_uid TEXT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can list helper orders';
  END IF;
  RETURN QUERY
  SELECT ho.id, ho.helper_id, ho.user_id, ho.customer_id,
    COALESCE(ho.coin_amount, ho.diamond_amount, 0),
    COALESCE(ho.amount_usd, ho.total_price_usd, 0),
    COALESCE(ho.amount_local, ho.local_price, 0),
    COALESCE(ho.currency_code, ho.local_currency, ''),
    COALESCE(ho.payment_method, ''),
    COALESCE(ho.status, 'pending'),
    ho.user_payment_proof, ho.notes, ho.processed_at, ho.created_at, ho.user_country_code,
    th.user_id, th.wallet_balance,
    hp.display_name, hp.avatar_url, hp.app_uid::TEXT,
    cp.display_name, cp.avatar_url, cp.app_uid::TEXT
  FROM public.helper_orders ho
  LEFT JOIN public.topup_helpers th ON th.id = ho.helper_id
  LEFT JOIN public.profiles hp ON hp.id = th.user_id
  LEFT JOIN public.profiles cp ON cp.id = COALESCE(ho.user_id, ho.customer_id)
  WHERE (_status IS NULL OR _status = '' OR lower(_status) = 'all'
         OR COALESCE(ho.status, 'pending') = _status)
    AND (_search IS NULL OR trim(_search) = ''
         OR ho.id::TEXT ILIKE '%' || trim(_search) || '%'
         OR COALESCE(cp.display_name, '') ILIKE '%' || trim(_search) || '%'
         OR COALESCE(cp.app_uid::TEXT, '') ILIKE '%' || trim(_search) || '%'
         OR COALESCE(hp.display_name, '') ILIKE '%' || trim(_search) || '%'
         OR COALESCE(hp.app_uid::TEXT, '') ILIKE '%' || trim(_search) || '%')
  ORDER BY ho.created_at DESC NULLS LAST
  LIMIT GREATEST(COALESCE(_limit, 500), 1);
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_resolve_permanent_ban_targets(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_permanent_ban_step_one(UUID, TEXT, JSONB, BOOLEAN, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_permanent_ban_step_two(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_permanent_ban_step_three(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_admin_users(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_helper_orders(TEXT, TEXT, INTEGER) TO authenticated;

-- 9) Cleanup duplicate placeholder owners
DELETE FROM public.admin_users
WHERE role = 'owner' AND user_id IS NULL
  AND lower(COALESCE(email, '')) = 'owner@merilive.com';

-- 10) Emergency permanent ban for app_uid 1645256350
DO $$
DECLARE v_target_id UUID; v_actor_id UUID; v_existing UUID;
BEGIN
  SELECT id INTO v_target_id FROM public.profiles WHERE app_uid = '1645256350' LIMIT 1;
  SELECT user_id INTO v_actor_id FROM public.admin_users
  WHERE role = 'owner' AND is_active = true AND user_id IS NOT NULL
  ORDER BY created_at ASC NULLS LAST LIMIT 1;

  IF v_target_id IS NOT NULL THEN
    UPDATE public.profiles
    SET is_blocked = true, is_online = false,
        blocked_at = COALESCE(blocked_at, now()),
        blocked_reason = 'Emergency permanent ban: suspected balance theft and abusive gifting'
    WHERE id = v_target_id;

    UPDATE public.live_bans
    SET is_active = false, unbanned_by = v_actor_id, unbanned_at = now(),
        unban_reason = 'Superseded by emergency permanent ban'
    WHERE user_id = v_target_id AND is_active = true;

    SELECT id INTO v_existing FROM public.live_bans
    WHERE user_id = v_target_id AND is_active = true
      AND COALESCE(ban_type, '') = 'permanent' AND ban_end IS NULL AND expires_at IS NULL
    LIMIT 1;

    IF v_existing IS NULL THEN
      INSERT INTO public.live_bans (
        user_id, banned_by, reason, ban_type, ban_duration_hours, expires_at,
        is_active, ban_reason, violation_type, warning_count, ban_start, ban_end, auto_banned)
      VALUES (
        v_target_id, v_actor_id,
        'Emergency permanent ban: suspected balance theft and abusive gifting',
        'permanent', NULL, NULL, true,
        'Emergency permanent ban: suspected balance theft and abusive gifting',
        'balance_theft', 0, now(), NULL, false);
    END IF;

    INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
    VALUES (v_actor_id, 'emergency_permanent_ban', 'profile', v_target_id::TEXT,
            jsonb_build_object('app_uid', '1645256350',
                               'reason', 'suspected balance theft and abusive gifting'));
  END IF;
END $$;