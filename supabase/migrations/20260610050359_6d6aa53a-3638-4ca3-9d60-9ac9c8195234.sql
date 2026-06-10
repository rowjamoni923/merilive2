-- R2-Phase B Wave-2: lock search_path on remaining 10 public functions (linter sweep)
ALTER FUNCTION public._ferris_wheel_multiplier(integer) SET search_path = public;
ALTER FUNCTION public._mod_audit_extract_target(jsonb) SET search_path = public;
ALTER FUNCTION public._mod_audit_summary(text, text, jsonb, jsonb) SET search_path = public;
ALTER FUNCTION public._roulette_is_winner(text, integer) SET search_path = public;
ALTER FUNCTION public._roulette_official_multiplier(text) SET search_path = public;
ALTER FUNCTION public._teen_patti_score(integer[], text[]) SET search_path = public;
ALTER FUNCTION public.guard_agency_earnings_transfers_host() SET search_path = public;
ALTER FUNCTION public.lock_user_location() SET search_path = public;
ALTER FUNCTION public.sync_live_ban_columns() SET search_path = public;
ALTER FUNCTION public.tg_swift_pay_topups_touch() SET search_path = public;