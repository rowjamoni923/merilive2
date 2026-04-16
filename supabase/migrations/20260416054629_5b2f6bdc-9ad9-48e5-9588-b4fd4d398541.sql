ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vip_tier integer DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vip_expires_at timestamptz DEFAULT NULL;