-- Create live_bans table for tracking stream bans
CREATE TABLE public.live_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ban_reason TEXT NOT NULL,
  violation_type TEXT NOT NULL DEFAULT 'content_violation', -- 'face_absence', 'inappropriate_content', 'drugs', 'sexual_content'
  warning_count INTEGER DEFAULT 0,
  ban_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ban_end TIMESTAMP WITH TIME ZONE,
  ban_duration_hours INTEGER, -- NULL means permanent
  is_active BOOLEAN DEFAULT true,
  auto_banned BOOLEAN DEFAULT false,
  unbanned_by UUID REFERENCES auth.users(id),
  unbanned_at TIMESTAMP WITH TIME ZONE,
  unban_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create live_violations table for tracking warnings
CREATE TABLE public.live_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  stream_id UUID,
  violation_type TEXT NOT NULL, -- 'face_absence', 'drugs', 'sexual_content', 'inappropriate_content'
  warning_number INTEGER NOT NULL DEFAULT 1,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  auto_detected BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create live_moderation_settings table for admin configurable settings
CREATE TABLE public.live_moderation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Insert default moderation settings
INSERT INTO public.live_moderation_settings (setting_key, setting_value, description) VALUES
('face_absence_timeout', '{"seconds": 15}', 'Seconds before auto-closing stream when face is absent'),
('max_warnings_before_ban', '{"count": 3}', 'Number of warnings before auto-ban'),
('default_ban_durations', '{"options": [2, 5, 10, 24, 48, 72, 168, 720, 1200]}', 'Available ban duration options in hours'),
('auto_ban_duration_hours', '{"hours": 24}', 'Default auto-ban duration in hours'),
('content_detection_enabled', '{"enabled": true}', 'Enable/disable content detection'),
('face_detection_enabled', '{"enabled": true}', 'Enable/disable face detection');

-- Enable RLS
ALTER TABLE public.live_bans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_moderation_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for live_bans
CREATE POLICY "Users can view their own bans"
  ON public.live_bans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all bans"
  ON public.live_bans FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for live_violations  
CREATE POLICY "Users can view their own violations"
  ON public.live_violations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all violations"
  ON public.live_violations FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for live_moderation_settings
CREATE POLICY "Anyone can view moderation settings"
  ON public.live_moderation_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins can update moderation settings"
  ON public.live_moderation_settings FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Function to check if user is banned from live streaming
CREATE OR REPLACE FUNCTION public.is_user_live_banned(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.live_bans
    WHERE user_id = p_user_id
    AND is_active = true
    AND (ban_end IS NULL OR ban_end > now())
  );
END;
$$;

-- Function to get user's active ban info
CREATE OR REPLACE FUNCTION public.get_user_live_ban(p_user_id UUID)
RETURNS TABLE (
  ban_id UUID,
  ban_reason TEXT,
  ban_end TIMESTAMP WITH TIME ZONE,
  remaining_hours INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lb.id,
    lb.ban_reason,
    lb.ban_end,
    CASE 
      WHEN lb.ban_end IS NULL THEN NULL
      ELSE EXTRACT(EPOCH FROM (lb.ban_end - now()))::INTEGER / 3600
    END
  FROM public.live_bans lb
  WHERE lb.user_id = p_user_id
  AND lb.is_active = true
  AND (lb.ban_end IS NULL OR lb.ban_end > now())
  LIMIT 1;
END;
$$;

-- Function to record violation and check if ban needed
CREATE OR REPLACE FUNCTION public.record_live_violation(
  p_user_id UUID,
  p_stream_id UUID,
  p_violation_type TEXT,
  p_auto_detected BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_warning_count INTEGER;
  v_max_warnings INTEGER;
  v_auto_ban_hours INTEGER;
  v_result JSONB;
BEGIN
  -- Get max warnings setting
  SELECT (setting_value->>'count')::INTEGER INTO v_max_warnings
  FROM public.live_moderation_settings
  WHERE setting_key = 'max_warnings_before_ban';
  
  IF v_max_warnings IS NULL THEN v_max_warnings := 3; END IF;
  
  -- Get auto ban duration
  SELECT (setting_value->>'hours')::INTEGER INTO v_auto_ban_hours
  FROM public.live_moderation_settings
  WHERE setting_key = 'auto_ban_duration_hours';
  
  IF v_auto_ban_hours IS NULL THEN v_auto_ban_hours := 24; END IF;
  
  -- Count existing violations today
  SELECT COUNT(*) INTO v_warning_count
  FROM public.live_violations
  WHERE user_id = p_user_id
  AND created_at > now() - INTERVAL '24 hours';
  
  v_warning_count := v_warning_count + 1;
  
  -- Record violation
  INSERT INTO public.live_violations (user_id, stream_id, violation_type, warning_number, auto_detected)
  VALUES (p_user_id, p_stream_id, p_violation_type, v_warning_count, p_auto_detected);
  
  -- Check if ban needed
  IF v_warning_count >= v_max_warnings THEN
    -- Create ban
    INSERT INTO public.live_bans (user_id, ban_reason, violation_type, warning_count, ban_duration_hours, ban_end, auto_banned)
    VALUES (
      p_user_id, 
      'Auto-banned after ' || v_max_warnings || ' violations for ' || p_violation_type,
      p_violation_type,
      v_warning_count,
      v_auto_ban_hours,
      now() + (v_auto_ban_hours || ' hours')::INTERVAL,
      true
    );
    
    v_result := jsonb_build_object(
      'action', 'banned',
      'warning_count', v_warning_count,
      'ban_hours', v_auto_ban_hours
    );
  ELSE
    v_result := jsonb_build_object(
      'action', 'warning',
      'warning_count', v_warning_count,
      'warnings_remaining', v_max_warnings - v_warning_count
    );
  END IF;
  
  RETURN v_result;
END;
$$;

-- Create indexes for performance
CREATE INDEX idx_live_bans_user_active ON public.live_bans(user_id, is_active);
CREATE INDEX idx_live_bans_ban_end ON public.live_bans(ban_end) WHERE is_active = true;
CREATE INDEX idx_live_violations_user ON public.live_violations(user_id, created_at);