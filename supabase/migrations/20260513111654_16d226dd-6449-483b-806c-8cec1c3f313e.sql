-- Pin search_path on 9 SECURITY DEFINER functions flagged by Supabase linter (lint 0011)
-- This is a CONFIG-ONLY change. Function bodies are untouched. Zero feature impact.

ALTER FUNCTION public.apply_multi_level_ban(uuid, uuid, text, text) SET search_path = public;
ALTER FUNCTION public.auto_ban_device_on_live_ban() SET search_path = public;
ALTER FUNCTION public.check_ban_on_login(uuid, text, text) SET search_path = public;
ALTER FUNCTION public.check_device_ban_on_signup() SET search_path = public;
ALTER FUNCTION public.check_financial_update_security() SET search_path = public;
ALTER FUNCTION public.generate_admin_access_token(text, admin_role) SET search_path = public;
ALTER FUNCTION public.handle_pk_gift_scoring() SET search_path = public;
ALTER FUNCTION public.is_admin_v2(uuid) SET search_path = public;
ALTER FUNCTION public.update_admin_device_status(uuid, text, text) SET search_path = public;