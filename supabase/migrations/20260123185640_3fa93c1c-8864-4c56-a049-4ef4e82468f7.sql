-- Update admin_block_user function to also reset is_host, levels, and online status when blocking
CREATE OR REPLACE FUNCTION public.admin_block_user(_user_id uuid, _block boolean, _reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
    
    IF _block THEN
        -- When blocking: reset host status, levels, and set offline
        UPDATE public.profiles
        SET 
            is_blocked = true,
            blocked_at = now(),
            blocked_reason = _reason,
            is_host = false,  -- Convert to regular user
            user_level = 0,   -- Reset user level
            host_level = 0,   -- Reset host level
            is_online = false, -- Force offline
            is_verified = false, -- Remove verification
            host_status = 'inactive', -- Deactivate host status
            total_earnings = 0, -- Reset earnings
            pending_earnings = 0, -- Reset pending earnings
            last_seen_at = now()
        WHERE id = _user_id;
        
        -- Also remove from any agencies
        UPDATE public.agency_hosts
        SET status = 'left', left_at = now()
        WHERE host_id = _user_id AND status = 'active';
    ELSE
        -- When unblocking: just unblock, don't restore previous status
        UPDATE public.profiles
        SET 
            is_blocked = false,
            blocked_at = NULL,
            blocked_reason = NULL
        WHERE id = _user_id;
    END IF;
    
    -- Log the action
    PERFORM public.log_admin_action(
        CASE WHEN _block THEN 'block_user' ELSE 'unblock_user' END,
        'user',
        _user_id,
        jsonb_build_object('reason', _reason)
    );
    
    RETURN TRUE;
END;
$$;

-- Create function to permanently delete a user account
CREATE OR REPLACE FUNCTION public.admin_delete_user(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _user_display_name text;
    _user_app_uid text;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
    
    -- Get user info for logging before deletion
    SELECT display_name, app_uid INTO _user_display_name, _user_app_uid
    FROM public.profiles WHERE id = _user_id;
    
    -- Delete related records first (in order of dependencies)
    DELETE FROM public.followers WHERE follower_id = _user_id OR following_id = _user_id;
    DELETE FROM public.messages WHERE sender_id = _user_id OR receiver_id = _user_id;
    DELETE FROM public.conversations WHERE participant_1 = _user_id OR participant_2 = _user_id;
    DELETE FROM public.gift_transactions WHERE sender_id = _user_id OR receiver_id = _user_id;
    DELETE FROM public.call_events WHERE call_id IN (SELECT id FROM public.private_calls WHERE caller_id = _user_id OR receiver_id = _user_id);
    DELETE FROM public.private_calls WHERE caller_id = _user_id OR receiver_id = _user_id;
    DELETE FROM public.coin_transfers WHERE sender_id = _user_id OR receiver_id = _user_id;
    DELETE FROM public.user_task_progress WHERE user_id = _user_id;
    DELETE FROM public.game_bets WHERE user_id = _user_id;
    DELETE FROM public.game_players WHERE user_id = _user_id;
    DELETE FROM public.user_rewards WHERE user_id = _user_id;
    DELETE FROM public.reels WHERE user_id = _user_id;
    DELETE FROM public.live_streams WHERE host_id = _user_id;
    DELETE FROM public.party_room_participants WHERE user_id = _user_id;
    DELETE FROM public.agency_hosts WHERE host_id = _user_id;
    DELETE FROM public.face_verification_submissions WHERE user_id = _user_id;
    DELETE FROM public.face_records WHERE user_id = _user_id;
    DELETE FROM public.host_applications WHERE user_id = _user_id;
    DELETE FROM public.chat_moderation_logs WHERE user_id = _user_id;
    DELETE FROM public.notifications WHERE user_id = _user_id;
    DELETE FROM public.user_blacklist WHERE user_id = _user_id OR blocked_user_id = _user_id;
    DELETE FROM public.user_purchases WHERE user_id = _user_id;
    DELETE FROM public.shop_purchases WHERE user_id = _user_id;
    DELETE FROM public.recharge_requests WHERE user_id = _user_id;
    
    -- Log the deletion action
    PERFORM public.log_admin_action(
        'delete_user',
        'user',
        _user_id,
        jsonb_build_object(
            'display_name', _user_display_name,
            'app_uid', _user_app_uid,
            'deleted_at', now()
        )
    );
    
    -- Finally delete the profile (this will cascade if auth.users has proper FK)
    DELETE FROM public.profiles WHERE id = _user_id;
    
    -- Delete from auth.users using admin API (handled separately or via Supabase dashboard)
    -- Note: Full deletion from auth.users should be done via Supabase admin API
    
    RETURN TRUE;
END;
$$;

-- Create function to get full user details for admin view
CREATE OR REPLACE FUNCTION public.admin_get_user_full_details(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result jsonb;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
    
    SELECT jsonb_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'username', p.username,
        'avatar_url', p.avatar_url,
        'app_uid', p.app_uid,
        'email', au.email,
        'phone', au.phone,
        'gender', p.gender,
        'country_name', p.country_name,
        'is_host', p.is_host,
        'is_verified', p.is_verified,
        'is_blocked', p.is_blocked,
        'blocked_at', p.blocked_at,
        'blocked_reason', p.blocked_reason,
        'is_online', p.is_online,
        'last_seen_at', p.last_seen_at,
        'user_level', p.user_level,
        'host_level', p.host_level,
        'coins', p.coins,
        'total_earnings', p.total_earnings,
        'pending_earnings', p.pending_earnings,
        'total_consumption', p.total_consumption,
        'host_status', p.host_status,
        'call_rate_per_minute', p.call_rate_per_minute,
        'created_at', p.created_at,
        'bio', p.bio,
        'agency', (
            SELECT jsonb_build_object(
                'id', a.id,
                'name', a.name,
                'agency_code', a.agency_code
            )
            FROM public.agency_hosts ah
            JOIN public.agencies a ON a.id = ah.agency_id
            WHERE ah.host_id = p.id AND ah.status = 'active'
            LIMIT 1
        ),
        'followers_count', (SELECT COUNT(*) FROM public.followers WHERE following_id = p.id),
        'following_count', (SELECT COUNT(*) FROM public.followers WHERE follower_id = p.id),
        'total_gifts_received', (SELECT COALESCE(SUM(coin_value), 0) FROM public.gift_transactions WHERE receiver_id = p.id),
        'total_calls', (SELECT COUNT(*) FROM public.private_calls WHERE caller_id = p.id OR receiver_id = p.id),
        'auth_provider', au.raw_app_meta_data->>'provider',
        'last_sign_in', au.last_sign_in_at,
        'email_confirmed', au.email_confirmed_at IS NOT NULL
    ) INTO result
    FROM public.profiles p
    LEFT JOIN auth.users au ON au.id = p.id
    WHERE p.id = _user_id;
    
    RETURN result;
END;
$$;