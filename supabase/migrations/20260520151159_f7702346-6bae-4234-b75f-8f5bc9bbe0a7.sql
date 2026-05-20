-- Pkg64: Admin approve/revoke panel for L1-L5 helper-trader top-up permission
-- 1. Audit log table for every approval change
CREATE TABLE IF NOT EXISTS public.topup_trader_approval_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_id uuid NOT NULL REFERENCES public.topup_helpers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('approve','revoke')),
  previous_is_verified boolean,
  previous_is_active boolean,
  previous_trader_level int,
  new_is_verified boolean,
  new_is_active boolean,
  new_trader_level int,
  reason text,
  performed_by uuid,
  performed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_topup_trader_approval_log_helper ON public.topup_trader_approval_log(helper_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topup_trader_approval_log_created ON public.topup_trader_approval_log(created_at DESC);

ALTER TABLE public.topup_trader_approval_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin session full access" ON public.topup_trader_approval_log;
CREATE POLICY "Admin session full access" ON public.topup_trader_approval_log
  FOR ALL TO authenticated, anon
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

-- 2. Admin RPC: approve or revoke a helper's L1-L5 top-up permission
CREATE OR REPLACE FUNCTION public.admin_set_topup_trader_approval(
  _helper_id uuid,
  _approve boolean,
  _trader_level int DEFAULT NULL,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  h RECORD;
  new_lvl int;
  new_verified boolean;
  new_active boolean;
  admin_id uuid;
  admin_name text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session required');
  END IF;

  SELECT id, user_id, is_verified, is_active, trader_level
    INTO h
    FROM public.topup_helpers WHERE id = _helper_id FOR UPDATE;

  IF h.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Helper not found');
  END IF;

  IF _approve THEN
    new_lvl := COALESCE(NULLIF(_trader_level, 0), NULLIF(h.trader_level, 0), 1);
    IF new_lvl < 1 OR new_lvl > 5 THEN
      RETURN jsonb_build_object('success', false, 'error', 'trader_level must be 1-5');
    END IF;
    new_verified := true;
    new_active := true;
  ELSE
    new_lvl := h.trader_level;
    new_verified := false;
    new_active := COALESCE(h.is_active, true);
  END IF;

  UPDATE public.topup_helpers
    SET is_verified = new_verified,
        is_active = new_active,
        trader_level = new_lvl,
        updated_at = now()
    WHERE id = _helper_id;

  -- Resolve performer identity (admin session)
  BEGIN
    admin_id := NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN admin_id := NULL; END;
  admin_name := NULLIF(current_setting('request.headers.x-admin-username', true), '');

  INSERT INTO public.topup_trader_approval_log(
    helper_id, user_id, action,
    previous_is_verified, previous_is_active, previous_trader_level,
    new_is_verified, new_is_active, new_trader_level,
    reason, performed_by, performed_by_name
  ) VALUES (
    _helper_id, h.user_id, CASE WHEN _approve THEN 'approve' ELSE 'revoke' END,
    h.is_verified, h.is_active, h.trader_level,
    new_verified, new_active, new_lvl,
    _reason, admin_id, admin_name
  );

  RETURN jsonb_build_object(
    'success', true,
    'helper_id', _helper_id,
    'is_verified', new_verified,
    'is_active', new_active,
    'trader_level', new_lvl
  );
END; $$;

REVOKE ALL ON FUNCTION public.admin_set_topup_trader_approval(uuid, boolean, int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_topup_trader_approval(uuid, boolean, int, text) TO authenticated, service_role;

-- 3. Admin RPC: list helpers + their approval state for the panel
CREATE OR REPLACE FUNCTION public.admin_list_topup_traders_for_approval(_limit int DEFAULT 200)
RETURNS TABLE (
  helper_id uuid,
  user_id uuid,
  display_name text,
  app_uid text,
  avatar_url text,
  country_code text,
  country_flag text,
  trader_level int,
  wallet_balance bigint,
  total_sold bigint,
  is_active boolean,
  is_verified boolean,
  is_approved boolean,
  updated_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    h.id,
    h.user_id,
    p.display_name,
    p.app_uid,
    p.avatar_url,
    COALESCE(p.country_code, h.country_code),
    p.country_flag,
    h.trader_level,
    h.wallet_balance::bigint,
    COALESCE(h.total_sold,0)::bigint,
    COALESCE(h.is_active, true),
    COALESCE(h.is_verified, false),
    (COALESCE(h.is_active,true) AND COALESCE(h.is_verified,false)
       AND COALESCE(h.trader_level,0) BETWEEN 1 AND 5),
    h.updated_at
  FROM public.topup_helpers h
  LEFT JOIN public.profiles p ON p.id = h.user_id
  WHERE public.is_active_admin_session()
  ORDER BY h.updated_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 1000));
$$;
REVOKE ALL ON FUNCTION public.admin_list_topup_traders_for_approval(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_topup_traders_for_approval(int) TO authenticated, service_role;

-- 4. Admin RPC: recent approval change history
CREATE OR REPLACE FUNCTION public.admin_list_topup_trader_approval_log(_limit int DEFAULT 100)
RETURNS TABLE (
  id uuid,
  helper_id uuid,
  user_id uuid,
  display_name text,
  app_uid text,
  action text,
  previous_trader_level int,
  new_trader_level int,
  previous_is_verified boolean,
  new_is_verified boolean,
  reason text,
  performed_by_name text,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    l.id, l.helper_id, l.user_id,
    p.display_name, p.app_uid,
    l.action,
    l.previous_trader_level, l.new_trader_level,
    l.previous_is_verified, l.new_is_verified,
    l.reason, l.performed_by_name, l.created_at
  FROM public.topup_trader_approval_log l
  LEFT JOIN public.profiles p ON p.id = l.user_id
  WHERE public.is_active_admin_session()
  ORDER BY l.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 500));
$$;
REVOKE ALL ON FUNCTION public.admin_list_topup_trader_approval_log(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_topup_trader_approval_log(int) TO authenticated, service_role;

-- 5. Pkg37 admin broadcast bump on every approval change so the Recharge UI + Coin Traders page
--    refresh within 1s after admin click. Reuses existing tg_admin_broadcast_bump.
DROP TRIGGER IF EXISTS trg_admin_broadcast_topup_trader_approval_log ON public.topup_trader_approval_log;
CREATE TRIGGER trg_admin_broadcast_topup_trader_approval_log
AFTER INSERT ON public.topup_trader_approval_log
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('topup_helpers');