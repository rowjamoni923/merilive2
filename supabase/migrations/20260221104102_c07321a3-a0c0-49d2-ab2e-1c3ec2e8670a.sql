
-- =============================================
-- NEW HOST LIVE BONUS SYSTEM
-- Verified new hosts earn beans per hour of live streaming
-- Configurable by admin: reward per hour, max hours/day, eligible days
-- =============================================

-- Admin-configurable settings for the bonus
CREATE TABLE public.new_host_live_bonus_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  beans_per_hour INTEGER NOT NULL DEFAULT 18000,
  max_hours_per_day INTEGER NOT NULL DEFAULT 5,
  eligible_days INTEGER NOT NULL DEFAULT 3,
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT DEFAULT 'New verified hosts earn beans for each hour of live streaming',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.new_host_live_bonus_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings
CREATE POLICY "Anyone can read bonus settings"
  ON public.new_host_live_bonus_settings FOR SELECT
  USING (true);

-- Only admin can modify
CREATE POLICY "Admin can manage bonus settings"
  ON public.new_host_live_bonus_settings FOR ALL
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true)
  );

-- Insert default settings
INSERT INTO public.new_host_live_bonus_settings (beans_per_hour, max_hours_per_day, eligible_days, is_active)
VALUES (18000, 5, 3, true);

-- Track each host's daily progress
CREATE TABLE public.new_host_live_bonus_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bonus_date DATE NOT NULL DEFAULT CURRENT_DATE,
  hours_completed INTEGER NOT NULL DEFAULT 0,
  beans_earned INTEGER NOT NULL DEFAULT 0,
  day_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, bonus_date)
);

-- Enable RLS
ALTER TABLE public.new_host_live_bonus_progress ENABLE ROW LEVEL SECURITY;

-- Users can read their own progress
CREATE POLICY "Users can read own bonus progress"
  ON public.new_host_live_bonus_progress FOR SELECT
  USING (auth.uid() = user_id);

-- System can insert/update progress
CREATE POLICY "System can manage bonus progress"
  ON public.new_host_live_bonus_progress FOR ALL
  USING (auth.uid() = user_id);

-- Admin can read all progress
CREATE POLICY "Admin can read all bonus progress"
  ON public.new_host_live_bonus_progress FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true)
  );

-- Index for fast lookups
CREATE INDEX idx_new_host_bonus_progress_user_date 
  ON public.new_host_live_bonus_progress(user_id, bonus_date);

-- Trigger for updated_at
CREATE TRIGGER update_new_host_live_bonus_settings_updated_at
  BEFORE UPDATE ON public.new_host_live_bonus_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_new_host_live_bonus_progress_updated_at
  BEFORE UPDATE ON public.new_host_live_bonus_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to distribute hourly bonus for eligible new hosts
CREATE OR REPLACE FUNCTION public.claim_new_host_live_bonus(
  p_user_id UUID,
  p_hours INTEGER DEFAULT 1
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings RECORD;
  v_profile RECORD;
  v_progress RECORD;
  v_host_verified_at TIMESTAMP;
  v_days_since_verified INTEGER;
  v_today DATE := CURRENT_DATE;
  v_day_number INTEGER;
  v_new_hours INTEGER;
  v_beans_to_add INTEGER;
BEGIN
  -- Get active settings
  SELECT * INTO v_settings FROM new_host_live_bonus_settings WHERE is_active = true LIMIT 1;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Bonus system is not active');
  END IF;

  -- Get profile info
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_profile.is_host IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'Not a verified host');
  END IF;

  -- Check if face verified (verified host)
  IF v_profile.is_face_verified IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'error', 'Host must be face verified');
  END IF;

  -- Calculate days since becoming a host
  v_host_verified_at := COALESCE(v_profile.host_verified_at, v_profile.created_at);
  v_days_since_verified := EXTRACT(DAY FROM (now() - v_host_verified_at))::INTEGER;
  
  IF v_days_since_verified >= v_settings.eligible_days THEN
    RETURN json_build_object('success', false, 'error', 'Eligibility period expired', 'days_since', v_days_since_verified);
  END IF;

  v_day_number := v_days_since_verified + 1;

  -- Get or create today's progress
  SELECT * INTO v_progress FROM new_host_live_bonus_progress 
    WHERE user_id = p_user_id AND bonus_date = v_today FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO new_host_live_bonus_progress (user_id, bonus_date, hours_completed, beans_earned, day_number)
    VALUES (p_user_id, v_today, 0, 0, v_day_number)
    RETURNING * INTO v_progress;
  END IF;

  -- Check max hours
  IF v_progress.hours_completed >= v_settings.max_hours_per_day THEN
    RETURN json_build_object('success', false, 'error', 'Max hours reached today', 'hours', v_progress.hours_completed);
  END IF;

  -- Calculate beans to add
  v_new_hours := LEAST(p_hours, v_settings.max_hours_per_day - v_progress.hours_completed);
  v_beans_to_add := v_new_hours * v_settings.beans_per_hour;

  -- Update progress
  UPDATE new_host_live_bonus_progress
    SET hours_completed = hours_completed + v_new_hours,
        beans_earned = beans_earned + v_beans_to_add
    WHERE id = v_progress.id;

  -- Credit beans to profile
  UPDATE profiles
    SET beans = COALESCE(beans, 0) + v_beans_to_add
    WHERE id = p_user_id;

  RETURN json_build_object(
    'success', true,
    'beans_added', v_beans_to_add,
    'hours_completed', v_progress.hours_completed + v_new_hours,
    'max_hours', v_settings.max_hours_per_day,
    'day_number', v_day_number,
    'eligible_days', v_settings.eligible_days
  );
END;
$$;
