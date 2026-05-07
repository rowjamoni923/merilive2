REVOKE EXECUTE ON FUNCTION public.get_task_reset_date() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_task_week_reset_date() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_task_reset_date() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_task_week_reset_date() TO authenticated;