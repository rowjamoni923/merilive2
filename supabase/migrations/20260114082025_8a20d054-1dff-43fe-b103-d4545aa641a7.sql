-- Create notifications table for in-app notifications
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only view their own notifications
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
USING (auth.uid() = user_id);

-- Allow service role to insert notifications (from edge functions)
CREATE POLICY "Service role can insert notifications"
ON public.notifications
FOR INSERT
WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Create notification templates table for admin customization
CREATE TABLE public.notification_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_key TEXT NOT NULL UNIQUE,
  title_template TEXT NOT NULL,
  message_template TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

-- Everyone can read templates
CREATE POLICY "Anyone can read notification templates"
ON public.notification_templates
FOR SELECT
USING (true);

-- Only admins can update templates (will be checked in edge function)
CREATE POLICY "Admins can manage notification templates"
ON public.notification_templates
FOR ALL
USING (true);

-- Insert default templates
INSERT INTO public.notification_templates (template_key, title_template, message_template, description)
VALUES 
  ('agency_verification_code', '🔐 এজেন্সি ভেরিফিকেশন কোড', 'আপনার এজেন্সি ভেরিফিকেশন কোড: {{code}}

{{agency_name}} এজেন্সি তৈরি করতে এই কোডটি ব্যবহার করুন।

⚠️ এই কোডটি ১০ মিনিটের মধ্যে মেয়াদ শেষ হয়ে যাবে। কারো সাথে শেয়ার করবেন না।', 'এজেন্সি UID ভেরিফিকেশনের জন্য কোড পাঠানোর টেমপ্লেট'),
  ('agency_created', '🎉 এজেন্সি তৈরি সম্পন্ন!', 'অভিনন্দন! আপনার এজেন্সি "{{agency_name}}" সফলভাবে তৈরি হয়েছে।

এজেন্সি কোড: {{agency_code}}

এখন আপনি হোস্ট যুক্ত করতে এবং এজেন্সি পরিচালনা করতে পারবেন।', 'এজেন্সি তৈরি হওয়ার পর সফলতার বার্তা'),
  ('welcome_message', '👋 স্বাগতম!', 'আমাদের অ্যাপে স্বাগতম {{display_name}}! 

আপনি এখন লাইভ স্ট্রিম দেখতে, গিফট পাঠাতে এবং অন্যান্য ফিচার উপভোগ করতে পারবেন।', 'নতুন ইউজারদের জন্য স্বাগত বার্তা');