-- Add slideshow settings to app_settings
INSERT INTO app_settings (setting_key, setting_value, category, description)
VALUES 
  ('profile_slideshow_interval', '5', 'profile', 'Profile poster slideshow interval in seconds'),
  ('max_poster_images', '5', 'profile', 'Maximum number of poster images per user'),
  ('auto_ban_phone_threshold', '3', 'moderation', 'Number of phone number violations before auto-ban'),
  ('phone_detection_enabled', 'true', 'moderation', 'Enable AI phone number detection in chat')
ON CONFLICT (setting_key) DO NOTHING;

-- Create chat_moderation_logs table for tracking violations
CREATE TABLE IF NOT EXISTS public.chat_moderation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id UUID,
  conversation_id UUID,
  group_id UUID,
  violation_type TEXT NOT NULL DEFAULT 'phone_number',
  detected_content TEXT,
  action_taken TEXT DEFAULT 'warning',
  is_auto_action BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  notes TEXT
);

-- Enable RLS
ALTER TABLE public.chat_moderation_logs ENABLE ROW LEVEL SECURITY;

-- Admin can see all logs
CREATE POLICY "Admins can view all moderation logs"
ON public.chat_moderation_logs
FOR SELECT
USING (true);

-- Only system/admin can insert
CREATE POLICY "System can insert moderation logs"
ON public.chat_moderation_logs
FOR INSERT
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_moderation_logs_user_id ON public.chat_moderation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_violation_type ON public.chat_moderation_logs(violation_type);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_created_at ON public.chat_moderation_logs(created_at DESC);

-- Add violation_count to profiles for tracking
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS phone_violation_count INTEGER DEFAULT 0;

-- Create function to auto-ban user on threshold
CREATE OR REPLACE FUNCTION public.check_auto_ban_threshold()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  threshold INTEGER;
  current_count INTEGER;
BEGIN
  -- Get threshold from settings
  SELECT (setting_value::TEXT)::INTEGER INTO threshold
  FROM app_settings
  WHERE setting_key = 'auto_ban_phone_threshold';
  
  IF threshold IS NULL THEN
    threshold := 3;
  END IF;
  
  -- Get current violation count
  SELECT phone_violation_count INTO current_count
  FROM profiles
  WHERE id = NEW.user_id;
  
  -- Update violation count
  UPDATE profiles
  SET phone_violation_count = COALESCE(phone_violation_count, 0) + 1
  WHERE id = NEW.user_id;
  
  -- Check if should auto-ban
  IF (COALESCE(current_count, 0) + 1) >= threshold THEN
    -- Ban the user
    UPDATE profiles
    SET 
      is_blocked = true,
      blocked_at = now(),
      blocked_reason = 'Auto-banned for sharing phone numbers ' || (current_count + 1) || ' times',
      coins = 0,
      pending_earnings = 0
    WHERE id = NEW.user_id;
    
    -- Update the log to show ban action
    UPDATE chat_moderation_logs
    SET action_taken = 'auto_ban'
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for auto-ban
DROP TRIGGER IF EXISTS trigger_check_auto_ban ON public.chat_moderation_logs;
CREATE TRIGGER trigger_check_auto_ban
AFTER INSERT ON public.chat_moderation_logs
FOR EACH ROW
WHEN (NEW.violation_type = 'phone_number')
EXECUTE FUNCTION public.check_auto_ban_threshold();

-- Create function to confiscate coins on manual ban
CREATE OR REPLACE FUNCTION public.handle_user_ban()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If user is being blocked
  IF NEW.is_blocked = true AND (OLD.is_blocked IS NULL OR OLD.is_blocked = false) THEN
    -- Set coins and earnings to 0
    NEW.coins := 0;
    NEW.pending_earnings := 0;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for manual ban
DROP TRIGGER IF EXISTS trigger_handle_user_ban ON public.profiles;
CREATE TRIGGER trigger_handle_user_ban
BEFORE UPDATE ON public.profiles
FOR EACH ROW
WHEN (NEW.is_blocked = true AND (OLD.is_blocked IS NULL OR OLD.is_blocked = false))
EXECUTE FUNCTION public.handle_user_ban();