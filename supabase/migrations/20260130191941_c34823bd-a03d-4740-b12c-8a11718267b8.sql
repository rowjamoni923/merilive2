-- Create helper_admin_messages table for admin to message Level 5 helpers
CREATE TABLE IF NOT EXISTS public.helper_admin_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  helper_id UUID NOT NULL REFERENCES public.topup_helpers(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users(id),
  sender_type TEXT NOT NULL DEFAULT 'admin' CHECK (sender_type IN ('admin', 'system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMP WITH TIME ZONE,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_helper_admin_messages_helper_id ON public.helper_admin_messages(helper_id);
CREATE INDEX IF NOT EXISTS idx_helper_admin_messages_is_read ON public.helper_admin_messages(is_read);
CREATE INDEX IF NOT EXISTS idx_helper_admin_messages_created_at ON public.helper_admin_messages(created_at DESC);

-- Enable RLS
ALTER TABLE public.helper_admin_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow helpers to see their own messages
CREATE POLICY "Helpers can view their own messages"
  ON public.helper_admin_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.topup_helpers 
      WHERE id = helper_admin_messages.helper_id 
      AND user_id = auth.uid()
    )
  );

-- Allow helpers to mark messages as read
CREATE POLICY "Helpers can mark their messages as read"
  ON public.helper_admin_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.topup_helpers 
      WHERE id = helper_admin_messages.helper_id 
      AND user_id = auth.uid()
    )
  );

-- Allow authenticated users to insert (admin check in code)
CREATE POLICY "Authenticated users can insert messages"
  ON public.helper_admin_messages FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow authenticated users to view all (admin check in code)
CREATE POLICY "Authenticated users can view all messages"
  ON public.helper_admin_messages FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Add payment_account_number to helper_orders to track which account received payment
ALTER TABLE public.helper_orders 
ADD COLUMN IF NOT EXISTS payment_account_number TEXT,
ADD COLUMN IF NOT EXISTS payment_account_name TEXT;