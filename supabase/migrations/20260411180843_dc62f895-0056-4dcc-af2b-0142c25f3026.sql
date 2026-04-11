ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium';
ALTER TABLE public.admin_notifications ADD COLUMN IF NOT EXISTS target_role text DEFAULT 'all';