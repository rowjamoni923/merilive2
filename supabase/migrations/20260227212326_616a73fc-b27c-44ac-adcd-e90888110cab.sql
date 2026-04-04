-- Add image_url column to admin_notices for image attachments
ALTER TABLE public.admin_notices ADD COLUMN image_url text DEFAULT NULL;