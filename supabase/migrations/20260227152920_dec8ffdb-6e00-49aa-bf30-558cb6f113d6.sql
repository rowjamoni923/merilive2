
-- Add attachments column to helper_admin_messages for multiple image support
ALTER TABLE public.helper_admin_messages 
ADD COLUMN attachments text[] DEFAULT NULL;

-- Also add attachments to helper_message_replies for reply attachments
ALTER TABLE public.helper_message_replies 
ADD COLUMN attachments text[] DEFAULT NULL;
