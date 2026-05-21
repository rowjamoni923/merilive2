CREATE OR REPLACE FUNCTION public.admin_layout_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT jsonb_build_object(
    'online_users', (SELECT count(*) FROM public.profiles WHERE COALESCE(is_online, false) = true),
    'live_streams', (SELECT count(*) FROM public.live_streams WHERE COALESCE(is_active, false) = true),
    'helper_upgrade_requests_pending', (SELECT count(*) FROM public.helper_upgrade_requests WHERE status = 'pending'),
    'helper_topup_requests_pending', (SELECT count(*) FROM public.helper_topup_requests WHERE status = 'pending'),
    'helper_applications_pending', (SELECT count(*) FROM public.helper_applications WHERE status = 'pending'),
    'host_applications_pending', (SELECT count(*) FROM public.face_verification_submissions WHERE status IN ('pending', 'submitted', 'under_review') AND verification_type = 'host'),
    'agency_withdrawals_pending', (SELECT count(*) FROM public.agency_withdrawals WHERE status IN ('pending', 'processing')),
    'helper_replies_unread', (SELECT count(*) FROM public.helper_message_replies WHERE sender_type = 'helper' AND COALESCE(is_read, false) = false),
    'support_tickets_live_open', (SELECT count(*) FROM public.support_tickets WHERE category = 'live_chat' AND status IN ('open', 'pending')),
    'face_verifications_pending', (SELECT count(*) FROM public.face_verification_submissions WHERE status IN ('pending', 'submitted', 'under_review') AND verification_type = 'face'),
    'user_reports_pending', (SELECT count(*) FROM public.user_reports WHERE status = 'pending'),
    'payroll_requests_pending', (SELECT count(*) FROM public.payroll_requests WHERE status = 'pending'),
    'helper_orders_pending', (SELECT count(*) FROM public.helper_orders WHERE status = 'pending'),
    'live_bans_active', (SELECT count(*) FROM public.live_bans WHERE COALESCE(is_active, false) = true),
    'live_face_violations_pending', (SELECT count(*) FROM public.live_face_violations WHERE status = 'pending'),
    'host_conversion_requests_pending', (SELECT count(*) FROM public.host_conversion_requests WHERE status = 'pending'),
    'chat_moderation_unreviewed', (SELECT count(*) FROM public.chat_moderation_logs WHERE reviewed_at IS NULL),
    'helper_withdrawal_requests_pending', (SELECT count(*) FROM public.helper_withdrawal_requests WHERE status = 'pending'),
    'rating_reward_claims_pending', (SELECT count(*) FROM public.rating_reward_claims WHERE status = 'pending'),
    'leaderboard_reward_history_pending', (SELECT count(*) FROM public.leaderboard_reward_history WHERE status = 'pending'),
    'consumption_return_unclaimed', (SELECT count(*) FROM public.consumption_return_history WHERE COALESCE(is_claimed, false) = false),
    'agency_earnings_transfers_pending', (SELECT count(*) FROM public.agency_earnings_transfers WHERE status = 'pending'),
    'coin_transfers_pending', (SELECT count(*) FROM public.coin_transfers WHERE status = 'pending')
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_layout_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_layout_counts() TO authenticated, anon, service_role;