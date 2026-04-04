
-- NOTIFICATION ENGINE: Attach triggers to tables

DROP TRIGGER IF EXISTS trigger_notify_new_follower ON public.followers;
CREATE TRIGGER trigger_notify_new_follower
  AFTER INSERT ON public.followers FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_new_follower();

DROP TRIGGER IF EXISTS trigger_notify_gift_received ON public.gift_transactions;
CREATE TRIGGER trigger_notify_gift_received
  AFTER INSERT ON public.gift_transactions FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_gift_received();

DROP TRIGGER IF EXISTS trigger_notify_host_application ON public.host_applications;
CREATE TRIGGER trigger_notify_host_application
  AFTER UPDATE ON public.host_applications FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_host_application_status();

DROP TRIGGER IF EXISTS trigger_notify_recharge_completed ON public.recharge_transactions;
CREATE TRIGGER trigger_notify_recharge_completed
  AFTER UPDATE ON public.recharge_transactions FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_recharge_completed();

DROP TRIGGER IF EXISTS trigger_notify_live_started ON public.live_streams;
CREATE TRIGGER trigger_notify_live_started
  AFTER INSERT ON public.live_streams FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_live_stream_started();

DROP TRIGGER IF EXISTS trigger_notify_withdrawal_status ON public.agency_withdrawals;
CREATE TRIGGER trigger_notify_withdrawal_status
  AFTER UPDATE ON public.agency_withdrawals FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_withdrawal_status();
