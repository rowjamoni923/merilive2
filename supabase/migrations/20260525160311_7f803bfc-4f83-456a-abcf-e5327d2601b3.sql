DROP FUNCTION IF EXISTS public.admin_authenticate(text, text);

REVOKE ALL ON FUNCTION public.admin_authenticate(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_authenticate(text, text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.admin_authenticate(text, text, text) IS 'Authenticates admin credentials only when accompanied by a fresh secret-link challenge issued by validate-admin-token. Sessions last 7 days.';