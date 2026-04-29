CREATE OR REPLACE FUNCTION public.admin_block_user(
  _user_id uuid,
  _block boolean,
  _reason text DEFAULT NULL::text,
  _ban_device boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    _user_ip TEXT;
    _device_id TEXT;
    _admin_id UUID;
BEGIN
    _admin_id := COALESCE(auth.uid(), public.current_admin_id_from_header());

    IF _admin_id IS NULL OR NOT (public.is_admin(_admin_id) OR public.is_active_admin_session()) THEN
      RAISE EXCEPTION 'Access denied: admin only';
    END IF;

    -- This RPC is the approved admin pathway for block/unblock.
    -- The profiles table has trigger-level protection for is_blocked, so the
    -- bypass is set only after admin validation and only for this transaction.
    PERFORM set_config('app.bypass_profile_protection', 'true', true);

    UPDATE public.profiles
    SET is_blocked = _block,
        blocked_reason = CASE WHEN _block THEN _reason ELSE NULL END,
        blocked_at = CASE WHEN _block THEN now() ELSE NULL END
    WHERE id = _user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'User not found';
    END IF;

    IF _block AND _ban_device THEN
        SELECT last_login_ip, device_id INTO _user_ip, _device_id FROM public.profiles WHERE id = _user_id;

        IF _user_ip IS NOT NULL AND _user_ip <> '' THEN
            INSERT INTO public.banned_ips (ip_address, user_id, reason, banned_by)
            VALUES (_user_ip, _user_id, COALESCE(_reason, 'Banned by admin'), _admin_id)
            ON CONFLICT (ip_address) DO UPDATE SET is_active = true, updated_at = now();
        END IF;

        IF _device_id IS NOT NULL THEN
            INSERT INTO public.banned_devices (device_id, user_id, reason, banned_by)
            VALUES (_device_id, _user_id, COALESCE(_reason, 'Banned by admin'), _admin_id)
            ON CONFLICT (device_id) DO UPDATE SET is_active = true, updated_at = now();
        END IF;
    END IF;

    IF _block THEN
        UPDATE public.live_streams
        SET is_active = false,
            ended_at = now()
        WHERE host_id = _user_id
          AND is_active = true;
    END IF;
END;
$function$;