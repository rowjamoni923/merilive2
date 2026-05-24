CREATE OR REPLACE FUNCTION public.process_contact_violation(
    p_host_id UUID,
    p_detected_content TEXT,
    p_detected_pattern TEXT,
    p_source_type TEXT,
    p_source_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_violation_count INTEGER;
    v_new_violation_number INTEGER;
    v_penalty RECORD;
    v_beans_deducted INTEGER := 0;
    v_is_banned BOOLEAN := false;
    v_result JSONB;
    v_latest_violation_id UUID;
    v_safe_source_id UUID := NULL;
    v_current_earnings NUMERIC;
    v_is_host BOOLEAN := false;
    v_caller UUID := auth.uid();
    v_jwt_role TEXT := COALESCE(auth.jwt() ->> 'role', '');
BEGIN
    IF NOT (
        v_jwt_role = 'service_role'
        OR public.is_active_admin_session()
        OR (v_caller IS NOT NULL AND v_caller = p_host_id)
    ) THEN
        RAISE EXCEPTION 'Unauthorized contact violation target';
    END IF;

    IF p_detected_content IS NULL OR length(trim(p_detected_content)) < 1 OR length(p_detected_content) > 500 THEN
        RAISE EXCEPTION 'Invalid detected content';
    END IF;

    IF p_detected_pattern IS NULL OR p_detected_pattern !~ '^[a-zA-Z0-9_:-]{1,64}$' THEN
        RAISE EXCEPTION 'Invalid detected pattern';
    END IF;

    IF p_source_type IS NULL OR p_source_type NOT IN ('chat', 'live_stream', 'private_call', 'private_message', 'party_chat', 'image', 'unknown') THEN
        RAISE EXCEPTION 'Invalid source type';
    END IF;

    SELECT COALESCE(is_host, false), COALESCE(weekly_earnings, 0)
      INTO v_is_host, v_current_earnings
    FROM public.profiles
    WHERE id = p_host_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target profile not found';
    END IF;

    IF NOT v_is_host THEN
        RAISE EXCEPTION 'Contact violation target is not a host';
    END IF;

    IF p_source_id IS NOT NULL AND p_source_id != '' THEN
        BEGIN
            v_safe_source_id := p_source_id::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_safe_source_id := NULL;
        END;
    END IF;

    SELECT COUNT(*) INTO v_violation_count
    FROM public.host_contact_violations
    WHERE host_id = p_host_id;
    
    v_new_violation_number := v_violation_count + 1;
    
    SELECT * INTO v_penalty
    FROM public.violation_penalty_tiers
    WHERE violation_number = LEAST(v_new_violation_number, 6)
    AND is_active = true;
    
    IF v_penalty IS NULL THEN
        SELECT * INTO v_penalty
        FROM public.violation_penalty_tiers
        WHERE violation_number = 6
        AND is_active = true;
    END IF;
    
    IF v_penalty IS NOT NULL AND v_penalty.penalty_type = 'account_ban' THEN
        UPDATE public.profiles
        SET 
            is_blocked = true,
            blocked_reason = 'Auto-banned: 6+ contact sharing violations',
            blocked_at = now()
        WHERE id = p_host_id;
        
        v_is_banned := true;
        v_beans_deducted := 0;
    ELSIF v_penalty IS NOT NULL THEN
        v_beans_deducted := v_penalty.beans_amount;
        
        UPDATE public.profiles
        SET 
            weekly_earnings = COALESCE(weekly_earnings, 0) - v_beans_deducted,
            beans = COALESCE(beans, 0) - v_beans_deducted
        WHERE id = p_host_id;
    ELSE
        v_beans_deducted := 2000;
        UPDATE public.profiles
        SET 
            weekly_earnings = COALESCE(weekly_earnings, 0) - v_beans_deducted,
            beans = COALESCE(beans, 0) - v_beans_deducted
        WHERE id = p_host_id;
    END IF;
    
    INSERT INTO public.host_contact_violations (
        host_id, violation_number, violation_type, detected_content,
        detected_pattern, source_type, source_id, beans_deducted, is_auto_detected
    ) VALUES (
        p_host_id, v_new_violation_number, 'contact_sharing', left(p_detected_content, 500),
        p_detected_pattern, p_source_type, p_source_id, v_beans_deducted, true
    )
    RETURNING id INTO v_latest_violation_id;

    INSERT INTO public.chat_moderation_logs (
        user_id, violation_type, detected_content, conversation_id,
        action_taken, is_auto_action, notes
    ) VALUES (
        p_host_id, p_detected_pattern, left(p_detected_content, 500), v_safe_source_id,
        CASE WHEN v_is_banned THEN 'account_banned'
            ELSE 'beans_deducted_' || v_beans_deducted::TEXT
        END,
        true,
        'Violation #' || v_new_violation_number || ' | -' || v_beans_deducted || ' beans (was ' || v_current_earnings || ')'
    );
    
    v_result := jsonb_build_object(
        'success', true,
        'violation_id', v_latest_violation_id,
        'violation_number', v_new_violation_number,
        'beans_deducted', v_beans_deducted,
        'is_banned', v_is_banned
    );
    
    RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_contact_violation(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_contact_violation(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.process_contact_violation(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;