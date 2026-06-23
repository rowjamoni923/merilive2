-- Phase 5: notification triggers for the 5 remaining approval flows.
-- All write a single row into public.notifications; existing push pipeline
-- (notification_push_dispatches) picks it up.

CREATE OR REPLACE FUNCTION public.tg_notify_approval_status_generic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user uuid;
  v_user_field text := TG_ARGV[0];   -- column name holding the recipient user id
  v_kind text := TG_ARGV[1];         -- short kind label e.g. 'withdrawal'
  v_label text := TG_ARGV[2];        -- human label e.g. 'Withdrawal request'
  v_old text;
  v_new text;
  v_title text;
  v_msg text;
BEGIN
  v_old := lower(coalesce((to_jsonb(OLD)->>'status'), ''));
  v_new := lower(coalesce((to_jsonb(NEW)->>'status'), ''));
  IF v_old = v_new THEN RETURN NEW; END IF;
  IF v_new NOT IN ('approved','rejected','completed','paid','cancelled','canceled','failed') THEN
    RETURN NEW;
  END IF;

  v_user := nullif((to_jsonb(NEW)->>v_user_field), '')::uuid;
  IF v_user IS NULL THEN RETURN NEW; END IF;

  IF v_new IN ('approved','completed','paid') THEN
    v_title := v_label || ' approved';
    v_msg := 'Your ' || lower(v_label) || ' has been approved successfully.';
  ELSE
    v_title := v_label || ' ' || v_new;
    v_msg := 'Your ' || lower(v_label) || ' was ' || v_new || '. Please check details.';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data, is_read, created_at)
  VALUES (
    v_user,
    'approval_' || v_kind,
    v_title,
    v_msg,
    jsonb_build_object('kind', v_kind, 'row_id', (to_jsonb(NEW)->>'id'), 'status', v_new),
    false,
    now()
  );
  RETURN NEW;
END;
$function$;

-- helper_withdrawal_requests (user column: helper_id)
DROP TRIGGER IF EXISTS tg_notify_helper_withdrawal_status ON public.helper_withdrawal_requests;
CREATE TRIGGER tg_notify_helper_withdrawal_status
AFTER UPDATE OF status ON public.helper_withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_approval_status_generic('helper_id','withdrawal','Withdrawal request');

-- host_conversion_requests (user column: host_id)
DROP TRIGGER IF EXISTS tg_notify_host_conversion_status ON public.host_conversion_requests;
CREATE TRIGGER tg_notify_host_conversion_status
AFTER UPDATE OF status ON public.host_conversion_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_approval_status_generic('host_id','host_conversion','Role conversion request');

-- swift_pay_topups (user column: user_id)
DROP TRIGGER IF EXISTS tg_notify_swift_pay_status ON public.swift_pay_topups;
CREATE TRIGGER tg_notify_swift_pay_status
AFTER UPDATE OF status ON public.swift_pay_topups
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_approval_status_generic('user_id','swift_pay','Wallet top-up');

-- rating_reward_claims (user column: user_id)
DROP TRIGGER IF EXISTS tg_notify_rating_claim_status ON public.rating_reward_claims;
CREATE TRIGGER tg_notify_rating_claim_status
AFTER UPDATE OF status ON public.rating_reward_claims
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_approval_status_generic('user_id','rating_reward','Rating reward claim');

-- payroll_requests (user column: user_id)
DROP TRIGGER IF EXISTS tg_notify_payroll_status ON public.payroll_requests;
CREATE TRIGGER tg_notify_payroll_status
AFTER UPDATE OF status ON public.payroll_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_notify_approval_status_generic('user_id','payroll','Payroll request');