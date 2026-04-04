-- Drop the old functions first to recreate with new parameter names
DROP FUNCTION IF EXISTS public.deduct_call_coins_per_minute(uuid);
DROP FUNCTION IF EXISTS public.start_private_call(uuid, uuid, text);