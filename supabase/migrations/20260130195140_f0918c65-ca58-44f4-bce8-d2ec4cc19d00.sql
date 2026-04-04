-- Create table for helper message replies with screenshot support
CREATE TABLE public.helper_message_replies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.helper_admin_messages(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_type TEXT NOT NULL DEFAULT 'helper', -- 'helper' or 'admin'
  content TEXT NOT NULL,
  screenshot_url TEXT,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_helper_message_replies_message_id ON public.helper_message_replies(message_id);
CREATE INDEX idx_helper_message_replies_sender_id ON public.helper_message_replies(sender_id);

-- Enable RLS
ALTER TABLE public.helper_message_replies ENABLE ROW LEVEL SECURITY;

-- Policy for helpers to view replies on their messages
CREATE POLICY "Helpers can view replies on their messages"
ON public.helper_message_replies FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM helper_admin_messages ham
    JOIN topup_helpers th ON ham.helper_id = th.id
    WHERE ham.id = message_id AND th.user_id = auth.uid()
  )
  OR sender_id = auth.uid()
);

-- Policy for helpers to create replies
CREATE POLICY "Helpers can create replies"
ON public.helper_message_replies FOR INSERT
WITH CHECK (
  sender_type = 'helper' 
  AND sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM helper_admin_messages ham
    JOIN topup_helpers th ON ham.helper_id = th.id
    WHERE ham.id = message_id AND th.user_id = auth.uid()
  )
);

-- Policy for admins to view all replies
CREATE POLICY "Admins can view all replies"
ON public.helper_message_replies FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Policy for admins to create replies
CREATE POLICY "Admins can create replies"
ON public.helper_message_replies FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Policy for admins to update replies (mark as read)
CREATE POLICY "Admins can update replies"
ON public.helper_message_replies FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Add has_replies flag to helper_admin_messages for quick lookup
ALTER TABLE public.helper_admin_messages 
ADD COLUMN IF NOT EXISTS has_replies BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS last_reply_at TIMESTAMP WITH TIME ZONE;

-- Create function to update has_replies when reply is added
CREATE OR REPLACE FUNCTION update_message_has_replies()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE helper_admin_messages 
  SET has_replies = true, last_reply_at = NEW.created_at
  WHERE id = NEW.message_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger
CREATE TRIGGER on_helper_reply_added
AFTER INSERT ON helper_message_replies
FOR EACH ROW EXECUTE FUNCTION update_message_has_replies();

-- Create storage bucket for helper screenshots if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('helper-screenshots', 'helper-screenshots', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for helper screenshots
CREATE POLICY "Anyone can view helper screenshots"
ON storage.objects FOR SELECT
USING (bucket_id = 'helper-screenshots');

CREATE POLICY "Authenticated users can upload helper screenshots"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'helper-screenshots' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete their own helper screenshots"
ON storage.objects FOR DELETE
USING (bucket_id = 'helper-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);