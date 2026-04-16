-- ============= face_verification_submissions =============
ALTER TABLE public.face_verification_submissions
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS profile_photo_url text,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS host_photos text[],
  ADD COLUMN IF NOT EXISTS face_image_url text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS is_duplicate_face boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicate_face_user_id uuid,
  ADD COLUMN IF NOT EXISTS duplicate_face_name text,
  ADD COLUMN IF NOT EXISTS duplicate_face_uid text,
  ADD COLUMN IF NOT EXISTS duplicate_face_avatar text;

UPDATE public.face_verification_submissions
  SET face_image_url = selfie_url
  WHERE face_image_url IS NULL AND selfie_url IS NOT NULL;

-- ============= live_bans =============
ALTER TABLE public.live_bans
  ADD COLUMN IF NOT EXISTS ban_reason text,
  ADD COLUMN IF NOT EXISTS violation_type text DEFAULT 'inappropriate_content',
  ADD COLUMN IF NOT EXISTS warning_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ban_start timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ban_end timestamptz,
  ADD COLUMN IF NOT EXISTS auto_banned boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS unbanned_by uuid,
  ADD COLUMN IF NOT EXISTS unbanned_at timestamptz,
  ADD COLUMN IF NOT EXISTS unban_reason text;

UPDATE public.live_bans
  SET ban_reason = COALESCE(ban_reason, reason),
      ban_end = COALESCE(ban_end, expires_at);

-- ============= notification_templates =============
ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS title_template text,
  ADD COLUMN IF NOT EXISTS message_template text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'general';

UPDATE public.notification_templates
  SET title_template = COALESCE(title_template, title),
      message_template = COALESCE(message_template, body);

-- Add unique constraint on template_key (needed for ON CONFLICT)
CREATE UNIQUE INDEX IF NOT EXISTS notification_templates_template_key_key
  ON public.notification_templates(template_key);

-- Seed default broadcast templates
INSERT INTO public.notification_templates (template_key, title, body, title_template, message_template, description, category, is_active)
VALUES
  ('push_host_welcome', '🎤 Welcome New Host!', 'Start streaming and earn beans every hour. Tap to begin!', '🎤 Welcome New Host!', 'Start streaming and earn beans every hour. Tap to begin!', 'Welcome message for newly approved hosts', 'push_host', true),
  ('push_host_reminder', '📺 Time to Go Live', 'Your fans are waiting! Start a stream to earn rewards.', '📺 Time to Go Live', 'Your fans are waiting! Start a stream to earn rewards.', 'Reminder for inactive hosts', 'push_host', true),
  ('push_inviter_reward', '🎁 Referral Reward Earned!', 'You earned diamonds from a successful referral.', '🎁 Referral Reward Earned!', 'You earned diamonds from a successful referral.', 'Sent when inviter earns referral bonus', 'push_inviter', true),
  ('push_live_5hr', '⏰ 5-Hour Live Bonus Ready!', 'Complete 5 hours of live streaming today and claim 50,000 beans!', '⏰ 5-Hour Live Bonus Ready!', 'Complete 5 hours of live streaming today and claim 50,000 beans!', 'Daily reminder for 5-hour live bonus', 'push_live', true),
  ('email_general_welcome', 'Welcome to MeriLive', 'Thanks for joining MeriLive!', 'Welcome to MeriLive', 'Thanks for joining MeriLive!', 'Generic welcome email', 'email_general', true)
ON CONFLICT (template_key) DO NOTHING;