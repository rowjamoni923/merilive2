-- Fix device_tokens upsert ON CONFLICT(token) failure
-- Partial unique index can't be used for ON CONFLICT without predicate; replace with a real UNIQUE constraint
DROP INDEX IF EXISTS public.device_tokens_token_uidx;
ALTER TABLE public.device_tokens DROP CONSTRAINT IF EXISTS device_tokens_token_key;
-- Clean any stray duplicates (keep newest)
DELETE FROM public.device_tokens d
 USING public.device_tokens d2
 WHERE d.token = d2.token AND d.ctid < d2.ctid;
ALTER TABLE public.device_tokens ADD CONSTRAINT device_tokens_token_key UNIQUE (token);