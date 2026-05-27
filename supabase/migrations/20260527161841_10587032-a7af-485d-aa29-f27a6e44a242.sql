CREATE OR REPLACE FUNCTION public.admin_adjust_balance(
  _target_type text,
  _target_id   uuid,
  _field       text,
  _delta       bigint,
  _reason      text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id     uuid := public.current_admin_id_from_header();
  v_new          bigint;
  v_old          bigint;
  v_db_field     text;
  v_notify_uid   uuid;
  v_field_label  text;
  v_action_label text;
  v_amount       bigint;
  v_title        text;
  v_message      text;
  v_ntype        text;
BEGIN
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated as admin');
  END IF;

  IF _target_type = 'agency' THEN
    IF NOT public.admin_has_any_section_permission(
      ARRAY['agency-management','finance-hub','manual-topup','topup-system'], true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized for agency balance');
    END IF;
  ELSE
    IF NOT public.admin_has_any_section_permission(
      ARRAY['manual-topup','topup-system','finance-hub','user-management'], true
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized for balance changes');
    END IF;
  END IF;

  IF _delta IS NULL OR _delta = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Delta must be non-zero');
  END IF;
  IF abs(_delta) > 10000000000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount too large');
  END IF;
  IF _target_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Missing target id');
  END IF;

  IF _target_type = 'profile' THEN
    v_db_field := CASE _field
      WHEN 'coins' THEN 'coins'
      WHEN 'beans' THEN 'beans'
      WHEN 'diamonds' THEN 'diamonds'
      WHEN 'total_earnings' THEN 'total_earnings'
      WHEN 'pending_earnings' THEN 'pending_earnings'
      WHEN 'weekly_earnings' THEN 'weekly_earnings'
      WHEN 'beans_balance' THEN 'beans_balance'
      ELSE NULL
    END;
    IF v_db_field IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid profile field'); END IF;

    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    EXECUTE format(
      'UPDATE public.profiles
         SET %1$I = GREATEST(COALESCE(%1$I,0) + $1, 0), updated_at = now()
       WHERE id = $2
       RETURNING COALESCE(%1$I,0), COALESCE(%1$I,0) - $1', v_db_field
    ) INTO v_new, v_old USING _delta, _target_id;
    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    IF v_new IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
    v_notify_uid := _target_id;

  ELSIF _target_type = 'helper' THEN
    v_db_field := CASE _field
      WHEN 'wallet_balance' THEN 'wallet_balance'
      WHEN 'total_earnings' THEN 'total_earnings'
      ELSE NULL
    END;
    IF v_db_field IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid helper field'); END IF;

    IF v_db_field = 'wallet_balance' THEN
      UPDATE public.topup_helpers
         SET wallet_balance = GREATEST(COALESCE(wallet_balance,0) + _delta, 0),
             total_bought = CASE WHEN _delta > 0 THEN COALESCE(total_bought,0) + _delta ELSE COALESCE(total_bought,0) END,
             updated_at = now()
       WHERE id = _target_id
       RETURNING COALESCE(wallet_balance,0), COALESCE(wallet_balance,0) - _delta, user_id
       INTO v_new, v_old, v_notify_uid;
    ELSE
      EXECUTE format(
        'UPDATE public.topup_helpers
           SET %1$I = GREATEST(COALESCE(%1$I,0) + $1, 0), updated_at = now()
         WHERE id = $2
         RETURNING COALESCE(%1$I,0), COALESCE(%1$I,0) - $1, user_id', v_db_field
      ) INTO v_new, v_old, v_notify_uid USING _delta, _target_id;
    END IF;

    IF v_new IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Helper not found'); END IF;

    IF v_db_field = 'wallet_balance' THEN
      BEGIN
        INSERT INTO public.helper_transactions (
          helper_id, user_id, transaction_type, amount, balance_before, balance_after, description
        ) VALUES (
          _target_id,
          v_notify_uid,
          CASE WHEN _delta > 0 THEN 'admin_credit' ELSE 'admin_debit' END,
          _delta,
          v_old,
          v_new,
          COALESCE(_reason, CASE WHEN _delta > 0 THEN 'Admin helper wallet credit' ELSE 'Admin helper wallet debit' END)
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;

  ELSIF _target_type = 'agency' THEN
    v_db_field := CASE _field
      WHEN 'beans_balance' THEN 'beans_balance'
      WHEN 'diamond_balance' THEN 'diamond_balance'
      WHEN 'wallet_balance' THEN 'wallet_balance'
      ELSE NULL
    END;
    IF v_db_field IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid agency field'); END IF;

    PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
    EXECUTE format(
      'UPDATE public.agencies
         SET %1$I = GREATEST(COALESCE(%1$I,0) + $1, 0), updated_at = now()
       WHERE id = $2
       RETURNING COALESCE(%1$I,0), COALESCE(%1$I,0) - $1', v_db_field
    ) INTO v_new, v_old USING _delta, _target_id;
    PERFORM set_config('app.bypass_agency_economy_guard', 'false', true);

    IF v_new IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Agency not found'); END IF;
    SELECT owner_id INTO v_notify_uid FROM public.agencies WHERE id = _target_id;

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Invalid target type');
  END IF;

  BEGIN
    INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
    VALUES (
      v_admin_id,
      CASE WHEN _delta > 0 THEN 'balance_add' ELSE 'balance_deduct' END,
      _target_type, _target_id,
      jsonb_build_object('field', v_db_field, 'delta', _delta,
        'old_balance', v_old, 'new_balance', v_new, 'reason', _reason)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  IF v_notify_uid IS NOT NULL THEN
    BEGIN
      v_amount       := abs(_delta);
      v_field_label  := CASE v_db_field
        WHEN 'coins' THEN 'Coins'
        WHEN 'beans' THEN 'Beans'
        WHEN 'diamonds' THEN 'Diamonds'
        WHEN 'total_earnings' THEN 'Total Earnings'
        WHEN 'pending_earnings' THEN 'Pending Earnings'
        WHEN 'weekly_earnings' THEN 'Weekly Earnings'
        WHEN 'beans_balance' THEN 'Beans Balance'
        WHEN 'wallet_balance' THEN 'Wallet Balance'
        WHEN 'diamond_balance' THEN 'Diamond Balance'
        ELSE initcap(replace(v_db_field, '_', ' '))
      END;

      IF _delta > 0 THEN
        v_action_label := 'added to';
        v_title := '💰 ' || v_field_label || ' Added';
        v_ntype := 'admin_credit';
      ELSE
        v_action_label := 'deducted from';
        v_title := '⚠️ ' || v_field_label || ' Deducted';
        v_ntype := 'admin_debit';
      END IF;

      v_message := to_char(v_amount, 'FM999,999,999,999') || ' ' || v_field_label
                || ' ' || v_action_label || ' your account by admin.'
                || CASE WHEN _reason IS NOT NULL AND length(trim(_reason)) > 0
                        THEN ' Reason: ' || trim(_reason) ELSE '' END;

      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (
        v_notify_uid, v_ntype, v_title, v_message,
        jsonb_build_object(
          'target_type', _target_type, 'target_id', _target_id,
          'field', v_db_field, 'delta', _delta,
          'old_balance', v_old, 'new_balance', v_new,
          'reason', _reason, 'admin_id', v_admin_id,
          'source', 'admin_adjust_balance'
        )
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'new_balance', v_new, 'old_balance', v_old,
    'delta', _delta, 'field', v_db_field,
    'notified_user_id', v_notify_uid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_balance(text, uuid, text, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_balance(text, uuid, text, bigint, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.admin_adjust_balance(text, uuid, text, bigint, text) IS
'Pkg377: unified admin balance adjust; helper wallet credits also update total_bought and helper_transactions so wallet/top-up ledgers stay exact.';