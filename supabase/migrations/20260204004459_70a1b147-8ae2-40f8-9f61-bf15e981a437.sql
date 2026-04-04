-- Penalty configuration table (admin-configurable)
CREATE TABLE IF NOT EXISTS public.violation_penalty_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    violation_number INTEGER NOT NULL UNIQUE,
    penalty_type TEXT NOT NULL DEFAULT 'beans_deduction',
    beans_amount INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.violation_penalty_tiers ENABLE ROW LEVEL SECURITY;

-- Policies for penalty tiers (drop if exists first)
DROP POLICY IF EXISTS "Anyone can view penalty tiers" ON public.violation_penalty_tiers;
DROP POLICY IF EXISTS "Admins can manage penalty tiers" ON public.violation_penalty_tiers;

CREATE POLICY "Anyone can view penalty tiers"
ON public.violation_penalty_tiers FOR SELECT
TO authenticated
USING (is_active = true);

CREATE POLICY "Admins can manage penalty tiers"
ON public.violation_penalty_tiers FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.admin_users 
        WHERE user_id = auth.uid() 
        AND is_active = true
    )
);

-- Insert default penalty tiers (on conflict do nothing)
INSERT INTO public.violation_penalty_tiers (violation_number, penalty_type, beans_amount, description) VALUES
(1, 'beans_deduction', 2000, '1st Warning - 2,000 Beans deducted'),
(2, 'beans_deduction', 5000, '2nd Warning - 5,000 Beans deducted'),
(3, 'beans_deduction', 10000, '3rd Warning - 10,000 Beans deducted'),
(4, 'beans_deduction', 50000, '4th Warning - 50,000 Beans deducted'),
(5, 'beans_deduction', 100000, '5th Warning - 100,000 Beans deducted'),
(6, 'account_ban', 0, '6th Violation - Account Permanently Banned')
ON CONFLICT (violation_number) DO NOTHING;

-- Function to process violation and apply penalty
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
    
    v_result := jsonb_build_object(
        'success', true,
        'violation_id', v_latest_violation_id,
        'violation_number', v_new_violation_number,
        'beans_deducted', v_beans_deducted,
        'is_banned', v_is_banned,
        'penalty_description', v_penalty.description
    );
    
    RETURN v_result;
END;
$$;

-- Function for admin manual violation
CREATE OR REPLACE FUNCTION public.admin_add_violation(
    p_admin_id UUID,
    p_host_id UUID,
    p_detected_content TEXT,
    p_detected_pattern TEXT,
    p_source_type TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_result JSONB;
    v_violation_id UUID;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM public.admin_users 
        WHERE user_id = p_admin_id AND is_active = true
    ) INTO v_is_admin;
    
    IF NOT v_is_admin THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;
    
    v_result := public.process_contact_violation(
        p_host_id,
        p_detected_content,
        p_detected_pattern,
        p_source_type,
        NULL
    );
    
    v_violation_id := (v_result->>'violation_id')::UUID;
    
    UPDATE public.host_contact_violations
    SET 
        is_auto_detected = false,
        is_reviewed = true,
        reviewed_by = p_admin_id,
        reviewed_at = now(),
        review_notes = p_notes
    WHERE id = v_violation_id;
    
    RETURN v_result;
END;
$$;