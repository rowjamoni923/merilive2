-- Optimized indexes for Admin Sidebar Counts (Index-only scans)
CREATE INDEX IF NOT EXISTS idx_helper_upgrade_pending ON public.helper_upgrade_requests (status) WHERE (status = 'pending');
CREATE INDEX IF NOT EXISTS idx_helper_topup_pending ON public.helper_topup_requests (status) WHERE (status = 'pending');
CREATE INDEX IF NOT EXISTS idx_helper_apps_pending ON public.helper_applications (status) WHERE (status = 'pending');
CREATE INDEX IF NOT EXISTS idx_fvs_pending_verification ON public.face_verification_submissions (status, verification_type) WHERE (status IN ('pending', 'submitted', 'under_review'));
CREATE INDEX IF NOT EXISTS idx_agency_withdrawals_pending_status ON public.agency_withdrawals (status) WHERE (status IN ('pending', 'processing'));
CREATE INDEX IF NOT EXISTS idx_helper_message_replies_unread ON public.helper_message_replies (is_read) WHERE (COALESCE(is_read, false) = false AND sender_type = 'helper');
CREATE INDEX IF NOT EXISTS idx_support_tickets_live_open ON public.support_tickets (category, status) WHERE (category = 'live_chat' AND status IN ('open', 'pending'));
CREATE INDEX IF NOT EXISTS idx_user_reports_pending_status ON public.user_reports (status) WHERE (status = 'pending');
CREATE INDEX IF NOT EXISTS idx_payroll_requests_pending_status ON public.payroll_requests (status) WHERE (status = 'pending');
CREATE INDEX IF NOT EXISTS idx_helper_orders_pending_status ON public.helper_orders (status) WHERE (status = 'pending');
CREATE INDEX IF NOT EXISTS idx_live_face_violations_pending ON public.live_face_violations (status) WHERE (status = 'pending');
CREATE INDEX IF NOT EXISTS idx_host_conversion_pending ON public.host_conversion_requests (status) WHERE (status = 'pending');
CREATE INDEX IF NOT EXISTS idx_chat_moderation_unreviewed ON public.chat_moderation_logs (reviewed_at) WHERE (reviewed_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_helper_withdrawal_pending ON public.helper_withdrawal_requests (status) WHERE (status = 'pending');
CREATE INDEX IF NOT EXISTS idx_rating_reward_claims_pending ON public.rating_reward_claims (status) WHERE (status = 'pending');
CREATE INDEX IF NOT EXISTS idx_leaderboard_reward_pending ON public.leaderboard_reward_history (status) WHERE (status = 'pending');
CREATE INDEX IF NOT EXISTS idx_consumption_return_unclaimed ON public.consumption_return_history (is_claimed) WHERE (COALESCE(is_claimed, false) = false);
CREATE INDEX IF NOT EXISTS idx_agency_transfers_pending ON public.agency_earnings_transfers (status) WHERE (status = 'pending');
CREATE INDEX IF NOT EXISTS idx_coin_transfers_pending ON public.coin_transfers (status) WHERE (status = 'pending');

-- Update process_contact_violation to allow non-hosts (Phase 2)
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
    -- Authorization check
    IF NOT (
        v_jwt_role = 'service_role'
        OR public.is_active_admin_session()
        OR (v_caller IS NOT NULL AND v_caller = p_host_id)
    ) THEN
        RAISE EXCEPTION 'Unauthorized contact violation target';
    END IF;

    -- Validation
    IF p_detected_content IS NULL OR length(trim(p_detected_content)) < 1 OR length(p_detected_content) > 500 THEN
        RAISE EXCEPTION 'Invalid detected content';
    END IF;

    IF p_detected_pattern IS NULL OR p_detected_pattern !~ '^[a-zA-Z0-9_:-]{1,64}$' THEN
        RAISE EXCEPTION 'Invalid detected pattern';
    END IF;

    IF p_source_type IS NULL OR p_source_type NOT IN ('chat', 'live_stream', 'private_call', 'private_message', 'party_chat', 'image', 'unknown') THEN
        RAISE EXCEPTION 'Invalid source type';
    END IF;

    -- Get profile info
    SELECT COALESCE(is_host, false), COALESCE(weekly_earnings, 0)
      INTO v_is_host, v_current_earnings
    FROM public.profiles
    WHERE id = p_host_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target profile not found';
    END IF;

    -- Handle source UUID
    IF p_source_id IS NOT NULL AND p_source_id != '' THEN
        BEGIN
            v_safe_source_id := p_source_id::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_safe_source_id := NULL;
        END;
    END IF;

    -- Penalty calculation ONLY for hosts
    IF v_is_host THEN
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

        -- Log to host violations table
        INSERT INTO public.host_contact_violations (
            host_id, violation_number, violation_type, detected_content,
            detected_pattern, source_type, source_id, beans_deducted, is_auto_detected
        ) VALUES (
            p_host_id, v_new_violation_number, 'contact_sharing', left(p_detected_content, 500),
            p_detected_pattern, p_source_type, p_source_id, v_beans_deducted, true
        )
        RETURNING id INTO v_latest_violation_id;
    ELSE
        -- For regular users, just track the count (no automatic penalty unless admin acts)
        v_new_violation_number := 1;
        v_beans_deducted := 0;
        v_latest_violation_id := gen_random_uuid();
    END IF;

    -- Log to moderation logs for ALL users (This makes it show in Admin Alert Bell)
    INSERT INTO public.chat_moderation_logs (
        user_id, violation_type, detected_content, conversation_id,
        action_taken, is_auto_action, notes
    ) VALUES (
        p_host_id, p_detected_pattern, left(p_detected_content, 500), v_safe_source_id,
        CASE 
            WHEN v_is_banned THEN 'account_banned'
            WHEN v_beans_deducted > 0 THEN 'beans_deducted_' || v_beans_deducted::TEXT
            ELSE 'flagged_for_review'
        END,
        true,
        CASE 
            WHEN v_is_host THEN 'Host Violation #' || v_new_violation_number || ' | -' || v_beans_deducted || ' beans'
            ELSE 'User Flagged: Phone number detected in chat'
        END
    );
    
    v_result := jsonb_build_object(
        'success', true,
        'violation_id', v_latest_violation_id,
        'violation_number', v_new_violation_number,
        'beans_deducted', v_beans_deducted,
        'is_banned', v_is_banned,
        'is_host', v_is_host
    );
    
    RETURN v_result;
END;
$$;
