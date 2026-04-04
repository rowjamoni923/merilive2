-- Fix broken permanent-ban trigger + enforce permanent live bans + duplicate-face hard ban

-- A) Fix existing trigger function (live_streams uses is_active, not status)
CREATE OR REPLACE FUNCTION public.enforce_permanent_ban()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_blocked = true AND (OLD.is_blocked IS NOT TRUE) THEN
    NEW.is_host := false;
    NEW.host_status := 'rejected';
    NEW.is_online := false;
    NEW.is_in_call := false;
    NEW.active_session_id := null;

    UPDATE public.agency_hosts
    SET status = 'removed', left_at = now()
    WHERE host_id = NEW.id AND status = 'active';

    UPDATE public.agencies
    SET is_blocked = true,
        is_active = false,
        blocked_at = now(),
        blocked_reason = 'Owner permanently banned'
    WHERE owner_id = NEW.id AND is_blocked IS NOT TRUE;

    DELETE FROM public.followers
    WHERE follower_id = NEW.id OR following_id = NEW.id;

    UPDATE public.live_streams
    SET is_active = false,
        ended_at = now()
    WHERE host_id = NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

-- B) Strong duplicate face lookup (all users)
DROP FUNCTION IF EXISTS public.find_account_by_face(text);
CREATE FUNCTION public.find_account_by_face(face_hash_param text)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  app_uid text,
  is_deleted boolean,
  deletion_scheduled_at timestamptz,
  is_blocked boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, p.app_uid, p.is_deleted, p.deletion_scheduled_at, p.is_blocked
  FROM public.profiles p
  WHERE p.face_hash = face_hash_param
  ORDER BY p.created_at ASC
  LIMIT 1;
END;
$$;

-- C) Duplicate-face self-ban RPC
CREATE OR REPLACE FUNCTION public.ban_duplicate_face_attempt(
  _user_id uuid,
  _duplicate_user_id uuid,
  _duplicate_uid text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_id text;
  v_reason text;
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'Unauthorized duplicate-face ban attempt';
  END IF;

  v_reason := format(
    'Permanent ban: duplicate face detected. Matched existing account %s',
    COALESCE(_duplicate_uid, _duplicate_user_id::text)
  );

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET is_blocked = true,
      blocked_reason = v_reason,
      blocked_at = now()
  WHERE id = _user_id
    AND is_blocked IS NOT TRUE;

  INSERT INTO public.live_bans (user_id, ban_reason, violation_type, ban_duration_hours, ban_end, is_active, auto_banned)
  SELECT _user_id, v_reason, 'duplicate_face', NULL, NULL, true, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.live_bans
    WHERE user_id = _user_id AND is_active = true AND ban_end IS NULL AND ban_duration_hours IS NULL
  );

  SELECT device_id INTO v_device_id FROM public.profiles WHERE id = _user_id;
  IF v_device_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.banned_devices WHERE device_id = v_device_id AND is_permanent = true
  ) THEN
    INSERT INTO public.banned_devices (user_id, device_id, reason, is_permanent, banned_at)
    VALUES (_user_id, v_device_id, v_reason, true, now());
  END IF;

  RETURN jsonb_build_object('success', true, 'reason', v_reason);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ban_duplicate_face_attempt(uuid, uuid, text) TO authenticated;

-- D) Any active permanent live ban must block profile
CREATE OR REPLACE FUNCTION public.enforce_permanent_live_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_id text;
BEGIN
  IF NEW.is_active = true AND NEW.ban_end IS NULL AND NEW.ban_duration_hours IS NULL THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);

    UPDATE public.profiles
    SET is_blocked = true,
        blocked_reason = COALESCE(NEW.ban_reason, 'Permanent ban by admin'),
        blocked_at = COALESCE(blocked_at, now())
    WHERE id = NEW.user_id
      AND is_blocked IS NOT TRUE;

    SELECT device_id INTO v_device_id FROM public.profiles WHERE id = NEW.user_id;
    IF v_device_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.banned_devices WHERE device_id = v_device_id AND is_permanent = true
    ) THEN
      INSERT INTO public.banned_devices (user_id, device_id, reason, is_permanent, banned_at)
      VALUES (NEW.user_id, v_device_id, COALESCE(NEW.ban_reason, 'Permanent ban by admin'), true, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_enforce_permanent_live_ban ON public.live_bans;
CREATE TRIGGER trigger_enforce_permanent_live_ban
AFTER INSERT OR UPDATE OF is_active, ban_end, ban_duration_hours, ban_reason
ON public.live_bans
FOR EACH ROW
EXECUTE FUNCTION public.enforce_permanent_live_ban();

-- E) Backfill current permanent bans (those showing in admin list)
ALTER TABLE public.profiles DISABLE TRIGGER protect_sensitive_columns_trigger;

UPDATE public.profiles p
SET is_blocked = true,
    blocked_reason = COALESCE(lb.ban_reason, 'Permanent ban by admin'),
    blocked_at = COALESCE(p.blocked_at, now())
FROM public.live_bans lb
WHERE lb.user_id = p.id
  AND lb.is_active = true
  AND lb.ban_end IS NULL
  AND lb.ban_duration_hours IS NULL
  AND p.is_blocked IS NOT TRUE;

ALTER TABLE public.profiles ENABLE TRIGGER protect_sensitive_columns_trigger;

INSERT INTO public.banned_devices (user_id, device_id, reason, is_permanent, banned_at)
SELECT p.id, p.device_id, COALESCE(lb.ban_reason, 'Permanent ban by admin'), true, now()
FROM public.profiles p
JOIN public.live_bans lb ON lb.user_id = p.id
WHERE lb.is_active = true
  AND lb.ban_end IS NULL
  AND lb.ban_duration_hours IS NULL
  AND p.device_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.banned_devices bd
    WHERE bd.device_id = p.device_id AND bd.is_permanent = true
  );