
-- Update process_contact_violation to also log to chat_moderation_logs for admin visibility
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
BEGIN
    -- Count existing violations for this host
    SELECT COUNT(*) INTO v_violation_count
    FROM public.host_contact_violations
    WHERE host_id = p_host_id;
    
    v_new_violation_number := v_violation_count + 1;
    
    -- Get penalty tier for this violation number
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
    
    -- Apply penalty based on type
    IF v_penalty.penalty_type = 'account_ban' THEN
        UPDATE public.profiles
        SET 
            is_blocked = true,
            blocked_reason = 'Auto-banned: 6+ contact sharing violations',
            blocked_at = now()
        WHERE id = p_host_id;
        
        v_is_banned := true;
        v_beans_deducted := 0;
    ELSE
        v_beans_deducted := v_penalty.beans_amount;
        
        UPDATE public.profiles
        SET beans_balance = GREATEST(0, COALESCE(beans_balance, 0) - v_beans_deducted)
        WHERE id = p_host_id;
    END IF;
    
    -- Insert violation record
    INSERT INTO public.host_contact_violations (
        host_id,
        violation_number,
        violation_type,
        detected_content,
        detected_pattern,
        source_type,
        source_id,
        beans_deducted,
        is_auto_detected
    ) VALUES (
        p_host_id,
        v_new_violation_number,
        'contact_sharing',
        p_detected_content,
        p_detected_pattern,
        p_source_type,
        p_source_id,
        v_beans_deducted,
        true
    )
    RETURNING id INTO v_latest_violation_id;

    -- Also log to chat_moderation_logs for admin Chat Inspector real-time alerts
    INSERT INTO public.chat_moderation_logs (
        user_id,
        violation_type,
        detected_content,
        conversation_id,
        action_taken,
        is_auto_action,
        notes
    ) VALUES (
        p_host_id,
        'phone_number',
        p_detected_content,
        CASE WHEN p_source_id IS NOT NULL AND p_source_id != '' THEN p_source_id::UUID ELSE NULL END,
        CASE 
            WHEN v_is_banned THEN 'account_banned'
            ELSE 'beans_deducted_' || v_beans_deducted::TEXT
        END,
        true,
        'Auto-detected ' || p_detected_pattern || ' in ' || p_source_type || ' | Violation #' || v_new_violation_number
    );
    
    v_result := jsonb_build_object(
        'success', true,
        'violation_number', v_new_violation_number,
        'beans_deducted', v_beans_deducted,
        'is_banned', v_is_banned
    );
    
    RETURN v_result;
END;
$$;
