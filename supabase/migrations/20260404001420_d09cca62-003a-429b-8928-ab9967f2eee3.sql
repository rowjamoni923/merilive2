
-- Upgrade admin_block_user to support device ban + session revocation
CREATE OR REPLACE FUNCTION public.admin_block_user(
  _user_id uuid, 
  _block boolean, 
  _reason text DEFAULT NULL,
  _ban_device boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _device_id text;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
    
    IF _block THEN
        -- Block the user profile
        UPDATE public.profiles
        SET 
            is_blocked = true,
            blocked_at = now(),
            blocked_reason = _reason,
            is_host = false,
            user_level = 0,
            host_level = 0,
            is_online = false,
            is_verified = false,
            is_face_verified = false,
            face_verified_at = NULL,
            host_status = 'inactive',
            total_earnings = 0,
            pending_earnings = 0,
            last_seen_at = now(),
            -- Invalidate active session to force instant logout
            active_session_id = gen_random_uuid()::text
        WHERE id = _user_id;
        
        -- Remove from agency
        UPDATE public.agency_hosts
        SET status = 'left', left_at = now()
        WHERE host_id = _user_id AND status = 'active';

        -- Device ban if requested
        IF _ban_device THEN
            SELECT device_id INTO _device_id FROM public.profiles WHERE id = _user_id;
            
            IF _device_id IS NOT NULL AND _device_id != '' THEN
                INSERT INTO public.banned_devices (device_id, user_id, reason, is_permanent, banned_by)
                VALUES (_device_id, _user_id, COALESCE(_reason, 'Banned by admin with device ban'), true, auth.uid())
                ON CONFLICT DO NOTHING;
            END IF;
        END IF;

        -- Terminate any active live streams
        UPDATE public.live_streams
        SET is_active = false, ended_at = now()
        WHERE host_id = _user_id AND is_active = true;

        -- End any active calls
        UPDATE public.private_calls
        SET status = 'ended', ended_at = now(), end_reason = 'user_banned'
        WHERE (caller_id = _user_id OR receiver_id = _user_id) AND status IN ('ringing', 'connected');
    ELSE
        UPDATE public.profiles
        SET 
            is_blocked = false,
            blocked_at = NULL,
            blocked_reason = NULL
        WHERE id = _user_id;

        -- Remove device ban if exists
        DELETE FROM public.banned_devices WHERE user_id = _user_id;
    END IF;
    
    PERFORM public.log_admin_action(
        CASE WHEN _block THEN 'block_user' ELSE 'unblock_user' END,
        'user',
        _user_id,
        jsonb_build_object('reason', _reason, 'device_ban', _ban_device)
    );
    
    RETURN TRUE;
END;
$$;
