-- ============================================================
-- Pkg312 pass-2: Tasks & Daily Rewards overload hardening
-- ============================================================
-- Manual audit finding: older task reward RPC overloads still existed.
-- Keep one canonical implementation: claim_task_reward(uuid,uuid,text).
-- The legacy single-arg overload now delegates through auth.uid() so it cannot
-- drift in reset-date logic, mission buckets, race handling, or reward flags.

DROP FUNCTION IF EXISTS public.claim_task_reward(uuid, uuid);
DROP FUNCTION IF EXISTS public.claim_daily_login_reward();

CREATE OR REPLACE FUNCTION public.claim_task_reward(_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated', 'beans', 0, 'coins', 0);
  END IF;

  RETURN public.claim_task_reward(_user_id, _task_id, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_daily_task_reward(
  _user_id uuid,
  _task_id uuid,
  _reset_date text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden', 'beans', 0, 'coins', 0);
  END IF;

  RETURN public.claim_task_reward(_user_id, _task_id, _reset_date);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_task_reward(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_task_reward(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_daily_task_reward(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_daily_login_reward(date,timestamptz,timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_task_progress(text,integer,integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.claim_task_reward(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_task_reward(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_task_reward(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_login_reward(date,timestamptz,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_task_progress(text,integer,integer) TO authenticated;
