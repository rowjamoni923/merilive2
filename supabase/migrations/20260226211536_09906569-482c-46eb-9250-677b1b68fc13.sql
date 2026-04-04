
-- Delete ALL duplicate tokens (keep only one per token using ctid)
DELETE FROM public.device_tokens a
WHERE a.ctid <> (
  SELECT MIN(b.ctid) FROM public.device_tokens b WHERE b.token = a.token
);

-- Drop constraints
ALTER TABLE public.device_tokens DROP CONSTRAINT IF EXISTS device_tokens_user_id_token_key;
ALTER TABLE public.device_tokens DROP CONSTRAINT IF EXISTS device_tokens_user_id_fkey;
ALTER TABLE public.device_tokens DROP CONSTRAINT IF EXISTS device_tokens_token_key;

-- Make user_id nullable
ALTER TABLE public.device_tokens ALTER COLUMN user_id DROP NOT NULL;

-- Add unique on token
ALTER TABLE public.device_tokens ADD CONSTRAINT device_tokens_token_key UNIQUE (token);

-- Re-add FK with SET NULL
ALTER TABLE public.device_tokens ADD CONSTRAINT device_tokens_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
