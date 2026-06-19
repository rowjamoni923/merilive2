-- Phase 3 P1 fix: legacy `deduct_call_coins_per_minute` is an obsolete v1
-- private-call billing RPC that has been fully superseded by `bill_call_minute`
-- (called by the call-billing-tick edge function cron).
--
-- Searches across src/ and supabase/functions/ confirm NO client or edge
-- function calls this function — only old migration files reference it.
-- However it is still SECURITY DEFINER and `EXECUTE` is granted to PUBLIC
-- by default, so any authenticated user could invoke it via supabase.rpc()
-- to double-charge an active call (race against the cron tick).
--
-- We REVOKE execute from anon/authenticated/public to neutralize the risk
-- while keeping the function body in place so historical migrations remain
-- replayable. service_role retains execute (default).
REVOKE EXECUTE ON FUNCTION public.deduct_call_coins_per_minute(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.deduct_call_coins_per_minute(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.deduct_call_coins_per_minute(uuid) FROM authenticated;