-- Pkg342 Finance admin pass: secure Level-5 helper withdrawal decisions + tighten helper order RPC grants

CREATE OR REPLACE FUNCTION public.admin_process_helper_withdrawal_request(
  _request_id uuid,
  _status text,
  _diamond_reward bigint DEFAULT NULL,
  _admin_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid := public.current_admin_id_from_header();
  v_req public.helper_withdrawal_requests%ROWTYPE;
  v_status text := lower(coalesce(_status, ''));
  v_reward bigint;
  v_new_balance numeric;
BEGIN
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated as admin');
  END IF;

  IF NOT public.admin_has_any_section_permission(
    ARRAY['finance-hub','withdrawals','topup-system','helper-management','level-5-helpers'], true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized for helper withdrawal decisions');
  END IF;

  IF v_status NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid status');
  END IF;

  SELECT * INTO v_req
    FROM public.helper_withdrawal_requests
   WHERE id = _request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_req.status IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object(
      'success', true,
      'alreadyProcessed', true,
      'status', v_req.status,
      'diamond_reward', COALESCE(v_req.diamond_reward, 0)
    );
  END IF;

  IF v_status = 'rejected' THEN
    UPDATE public.helper_withdrawal_requests
       SET status = 'rejected',
           admin_notes = COALESCE(_admin_notes, admin_notes, 'Rejected by admin'),
           updated_at = now()
     WHERE id = _request_id;

    BEGIN
      INSERT INTO public.helper_notifications (helper_id, type, title, message, data)
      VALUES (
        v_req.helper_id,
        'withdrawal_rejected',
        '❌ Withdrawal Rejected',
        COALESCE(_admin_notes, 'Your withdrawal submission was rejected'),
        jsonb_build_object('withdrawal_id', _request_id)
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
      INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
      VALUES (v_admin_id, 'helper_withdrawal_rejected', 'helper_withdrawal_request', _request_id,
              jsonb_build_object('helper_id', v_req.helper_id, 'notes', _admin_notes));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    RETURN jsonb_build_object('success', true, 'status', 'rejected');
  END IF;

  v_reward := COALESCE(_diamond_reward, v_req.diamond_reward, 0);
  IF v_reward < 0 OR v_reward > 10000000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid diamond reward');
  END IF;

  UPDATE public.helper_withdrawal_requests
     SET status = 'approved',
         diamond_reward = v_reward,
         admin_notes = COALESCE(_admin_notes, admin_notes),
         approved_at = now(),
         updated_at = now()
   WHERE id = _request_id;

  IF v_reward > 0 THEN
    UPDATE public.topup_helpers
       SET wallet_balance = COALESCE(wallet_balance, 0) + v_reward,
           updated_at = now()
     WHERE id = v_req.helper_id
     RETURNING wallet_balance INTO v_new_balance;
  ELSE
    SELECT wallet_balance INTO v_new_balance
      FROM public.topup_helpers
     WHERE id = v_req.helper_id;
  END IF;

  BEGIN
    INSERT INTO public.helper_notifications (helper_id, type, title, message, data)
    VALUES (
      v_req.helper_id,
      'diamonds_credited',
      '💎 Diamonds Credited!',
      v_reward::text || ' diamonds added for processing withdrawal',
      jsonb_build_object('diamond_reward', v_reward, 'withdrawal_id', _request_id, 'wallet_balance', v_new_balance)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
    VALUES (v_admin_id, 'helper_withdrawal_approved', 'helper_withdrawal_request', _request_id,
            jsonb_build_object('helper_id', v_req.helper_id, 'diamond_reward', v_reward, 'new_wallet_balance', v_new_balance));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'approved',
    'diamond_reward', v_reward,
    'new_wallet_balance', v_new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_process_helper_withdrawal_request(uuid, text, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_process_helper_withdrawal_request(uuid, text, bigint, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.process_helper_order_secure(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.process_helper_order_secure(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_process_helper_withdrawal_request(uuid, text, bigint, text) IS
'Pkg342: admin-only, row-locked approval/rejection for helper_withdrawal_requests. Credits topup_helpers.wallet_balance exactly once and writes best-effort audit/notifications.';