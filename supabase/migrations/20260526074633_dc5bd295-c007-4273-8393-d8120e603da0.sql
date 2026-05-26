-- ============================================================
-- 1. RATING REWARD CLAIMS: RLS policies + secure submit RPC
-- ============================================================

-- Self SELECT (for the popup's "latest claim" check)
DROP POLICY IF EXISTS "rrc_select_own" ON public.rating_reward_claims;
CREATE POLICY "rrc_select_own"
ON public.rating_reward_claims
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admin full access (review + approve/reject)
DROP POLICY IF EXISTS "rrc_admin_all" ON public.rating_reward_claims;
CREATE POLICY "rrc_admin_all"
ON public.rating_reward_claims
FOR ALL
TO authenticated
USING (public.is_active_admin_session() OR public.is_admin(auth.uid()))
WITH CHECK (public.is_active_admin_session() OR public.is_admin(auth.uid()));

-- NO client INSERT/UPDATE/DELETE policies — all writes go through submit_rating_proof RPC.

-- Secure submit RPC: server decides reward type + amount; client passes only screenshot URL + platform.
CREATE OR REPLACE FUNCTION public.submit_rating_proof(
  _screenshot_url text,
  _platform text DEFAULT 'web'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile RECORD;
  v_amount_setting jsonb;
  v_host_beans int;
  v_user_diamonds int;
  v_reward_type text;
  v_reward_amount int;
  v_existing RECORD;
  v_platform text;
  v_url text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  v_url := trim(coalesce(_screenshot_url, ''));
  IF length(v_url) < 8 OR length(v_url) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_url');
  END IF;

  v_platform := lower(coalesce(nullif(trim(_platform), ''), 'web'));
  IF v_platform NOT IN ('web', 'android', 'ios') THEN
    v_platform := 'web';
  END IF;

  -- Block resubmit when latest claim is pending or approved.
  SELECT status INTO v_existing
  FROM public.rating_reward_claims
  WHERE user_id = v_uid
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND AND v_existing.status IN ('pending','approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_submitted', 'status', v_existing.status);
  END IF;

  -- Resolve reward amounts from admin settings.
  SELECT value INTO v_amount_setting
  FROM public.app_settings
  WHERE key = 'rating_reward_amounts'
  LIMIT 1;

  BEGIN
    v_host_beans := nullif((v_amount_setting->>'host_beans'),'')::int;
    v_user_diamonds := nullif((v_amount_setting->>'user_diamonds'),'')::int;
  EXCEPTION WHEN others THEN
    v_host_beans := NULL;
    v_user_diamonds := NULL;
  END;

  IF v_host_beans IS NULL OR v_host_beans <= 0 OR v_user_diamonds IS NULL OR v_user_diamonds <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'reward_not_configured');
  END IF;

  -- Determine reward type from current profile role.
  SELECT is_host, host_status, gender, is_banned, is_deleted
  INTO v_profile
  FROM public.profiles
  WHERE id = v_uid;

  IF NOT FOUND OR coalesce(v_profile.is_banned,false) OR coalesce(v_profile.is_deleted,false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_unavailable');
  END IF;

  IF coalesce(v_profile.is_host,false) = true
     AND v_profile.host_status = 'approved'
     AND lower(coalesce(v_profile.gender,'')) = 'female' THEN
    v_reward_type := 'beans';
    v_reward_amount := v_host_beans;
  ELSE
    v_reward_type := 'diamonds';
    v_reward_amount := v_user_diamonds;
  END IF;

  INSERT INTO public.rating_reward_claims (
    user_id, screenshot_url, platform,
    reward_type, reward_amount, reward_coins,
    status, claimed_at
  ) VALUES (
    v_uid, v_url, v_platform,
    v_reward_type, v_reward_amount, v_reward_amount,
    'pending', NOW()
  );

  RETURN jsonb_build_object('success', true, 'reward_type', v_reward_type, 'reward_amount', v_reward_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_rating_proof(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_rating_proof(text, text) TO authenticated;

-- ============================================================
-- 2. NEW HOST LIVE BONUS: 9000 → 10000 beans per hour (5 hrs = 50k)
--    The existing claim flow already enforces:
--      * unique (host_id, program_day, hour_number) → no duplicate row
--      * bonus_claimed flag + FOR UPDATE lock → no double-claim
--      * only hour_number 1..5 rows exist → 5/day hard cap
-- ============================================================
UPDATE public.new_host_live_bonus_settings
SET bonus_beans = 10000,
    bonus_amount = 10000,
    beans_per_hour = 10000,
    updated_at = NOW()
WHERE is_active = true
  AND hour_number BETWEEN 1 AND 5;