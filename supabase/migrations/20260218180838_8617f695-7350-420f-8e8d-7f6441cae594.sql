
-- Add registration and login tracking columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS registration_ip TEXT,
ADD COLUMN IF NOT EXISTS last_login_ip TEXT,
ADD COLUMN IF NOT EXISTS registration_device_info JSONB,
ADD COLUMN IF NOT EXISTS last_login_device_info JSONB,
ADD COLUMN IF NOT EXISTS registration_user_agent TEXT;
