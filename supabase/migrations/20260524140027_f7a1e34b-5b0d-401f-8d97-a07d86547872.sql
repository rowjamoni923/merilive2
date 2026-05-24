REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.emit_app_sync_notification(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_push_on_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.emit_app_sync_notification(uuid, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_push_on_notification() TO service_role;