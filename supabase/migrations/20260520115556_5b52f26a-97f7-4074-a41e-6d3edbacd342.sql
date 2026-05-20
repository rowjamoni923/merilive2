-- Pkg63: Admin notification bell — fill the last 4 broadcast-trigger gaps so every
-- actionable admin event reaches the bell + sound + toast within ~1 second.
DROP TRIGGER IF EXISTS tg_admin_broadcast_helper_message_replies ON public.helper_message_replies;
CREATE TRIGGER tg_admin_broadcast_helper_message_replies
AFTER INSERT OR UPDATE OR DELETE ON public.helper_message_replies
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('helper_message_replies');

DROP TRIGGER IF EXISTS tg_admin_broadcast_payroll_requests ON public.payroll_requests;
CREATE TRIGGER tg_admin_broadcast_payroll_requests
AFTER INSERT OR UPDATE OR DELETE ON public.payroll_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('payroll_requests');

DROP TRIGGER IF EXISTS tg_admin_broadcast_consumption_return_history ON public.consumption_return_history;
CREATE TRIGGER tg_admin_broadcast_consumption_return_history
AFTER INSERT OR UPDATE OR DELETE ON public.consumption_return_history
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('consumption_return_history');

DROP TRIGGER IF EXISTS tg_admin_broadcast_leaderboard_reward_history ON public.leaderboard_reward_history;
CREATE TRIGGER tg_admin_broadcast_leaderboard_reward_history
AFTER INSERT OR UPDATE OR DELETE ON public.leaderboard_reward_history
FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump('leaderboard_reward_history');