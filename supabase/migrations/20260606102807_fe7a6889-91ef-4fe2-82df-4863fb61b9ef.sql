-- Pkg427 — Agency commission + L5 helper payout fixes
-- Bug 1: commission orphaned if cron misses a week (date cutoff wrong)
-- Bug 2: L5 helper diamond reward double-credited (both profiles.coins AND profiles.diamonds got += reward)

-- ============ FIX 1: drop the wrong date cutoff in commission distribution ============
CREATE OR REPLACE FUNCTION public.process_agency_commission_distribution(_since timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _bucket RECORD;
  _group_usd numeric;
  _own_rate numeric;
  _own_level text;
  _own_commission bigint;
  _parent_id uuid;
  _parent_rate numeric;
  _bonus_rate numeric;
  _bonus_amount bigint;
  _child_rate numeric;
  _beans_per_usd numeric;
  _agencies_credited int := 0;
  _own_total bigint := 0;
  _bonus_total bigint := 0;
  _bonus_count int := 0;
  _is_helper_5 boolean;
  _hop int;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role' AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  _beans_per_usd := public.get_beans_per_usd();

  -- Pkg427: drop the 7-day created_at filter. commission_processed_at IS NULL is
  -- the correct idempotency gate; the date cutoff caused any missed cron cycle
  -- to permanently orphan commission for that week.
  FOR _bucket IN
    SELECT agency_id, date_trunc('week', created_at)::date AS period_start, SUM(amount)::bigint AS total_beans
    FROM public.agency_earnings_transfers
    WHERE commission_processed_at IS NULL
      AND status = 'completed'
      AND transfer_type = 'weekly_auto'
      AND (_since IS NULL OR created_at >= _since)
    GROUP BY agency_id, date_trunc('week', created_at)::date
  LOOP
    _group_usd := public.get_agency_group_volume_usd(_bucket.agency_id, _bucket.period_start);

    SELECT (level = 'A5' OR level = 'diamond') INTO _is_helper_5
    FROM public.agencies WHERE id = _bucket.agency_id;

    IF _is_helper_5 THEN
      _own_rate := 12.0;
      _own_level := 'Diamond (Fixed)';
    ELSE
      SELECT level_code, commission_rate INTO _own_level, _own_rate
      FROM public.get_agency_tier_rate_for_usd(_group_usd);
    END IF;

    IF _own_rate > 0 THEN
      _own_commission := FLOOR(_bucket.total_beans::numeric * _own_rate / 100.0)::bigint;

      INSERT INTO public.agency_commission_history (
        agency_id, transaction_type, original_amount, commission_rate, commission_amount, period_start, notes
      ) VALUES (
        _bucket.agency_id, 'weekly_aggregate', _bucket.total_beans, _own_rate, _own_commission, _bucket.period_start,
        format('Weekly Team Vol: $%s. Tier: %s', _group_usd, _own_level)
      ) ON CONFLICT DO NOTHING;

      IF FOUND THEN
        PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
        UPDATE public.agencies SET wallet_balance = COALESCE(wallet_balance, 0) + _own_commission WHERE id = _bucket.agency_id;
        PERFORM set_config('app.bypass_agency_economy_guard', 'false', true);
        _own_total := _own_total + _own_commission;
        _agencies_credited := _agencies_credited + 1;
      END IF;
    END IF;

    -- Upper-Agency Difference (Override Bonus). Hard-cap chain depth to 5.
    _child_rate := COALESCE(_own_rate, 0);
    SELECT parent_agency_id INTO _parent_id FROM public.agencies WHERE id = _bucket.agency_id;
    _hop := 0;

    WHILE _parent_id IS NOT NULL AND _hop < 5 LOOP
      _hop := _hop + 1;
      DECLARE
        _p_group_usd numeric;
        _p_is_h5 boolean;
      BEGIN
        _p_group_usd := public.get_agency_group_volume_usd(_parent_id, _bucket.period_start);
        SELECT (level = 'A5' OR level = 'diamond') INTO _p_is_h5 FROM public.agencies WHERE id = _parent_id;

        IF _p_is_h5 THEN
          _parent_rate := 12.0;
        ELSE
          SELECT commission_rate INTO _parent_rate FROM public.get_agency_tier_rate_for_usd(_p_group_usd);
        END IF;
      END;

      _bonus_rate := COALESCE(_parent_rate, 0) - _child_rate;

      IF _bonus_rate > 0 THEN
        _bonus_amount := FLOOR(_bucket.total_beans::numeric * _bonus_rate / 100.0)::bigint;

        INSERT INTO public.agency_commission_history (
          agency_id, transaction_type, original_amount, commission_rate, commission_amount, period_start, notes
        ) VALUES (
          _parent_id, 'upper_referral_bonus', _bucket.total_beans, _bonus_rate, _bonus_amount, _bucket.period_start,
          format('Override from Sub-agency. Rate Diff: %s%% - %s%%', _parent_rate, _child_rate)
        ) ON CONFLICT DO NOTHING;

        IF FOUND THEN
          PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
          UPDATE public.agencies SET wallet_balance = COALESCE(wallet_balance, 0) + _bonus_amount WHERE id = _parent_id;
          PERFORM set_config('app.bypass_agency_economy_guard', 'false', true);
          _bonus_total := _bonus_total + _bonus_amount;
          _bonus_count := _bonus_count + 1;
        END IF;
      END IF;

      _child_rate := GREATEST(_child_rate, COALESCE(_parent_rate, 0));
      SELECT parent_agency_id INTO _parent_id FROM public.agencies WHERE id = _parent_id;
    END LOOP;

    UPDATE public.agency_earnings_transfers
    SET commission_processed_at = now()
    WHERE agency_id = _bucket.agency_id
      AND date_trunc('week', created_at)::date = _bucket.period_start
      AND transfer_type = 'weekly_auto'
      AND commission_processed_at IS NULL;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'agencies_credited', _agencies_credited,
    'own_commission_total', _own_total,
    'upper_bonus_total', _bonus_total,
    'upper_bonuses_count', _bonus_count
  );
END;
$function$;

-- ============ FIX 2: stop double-crediting helper diamond reward ============
CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(_withdrawal_id uuid, _status text, _notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _w RECORD;
  _agency_owner_id UUID;
  _helper_user_id UUID;
  _is_payroll_helper BOOLEAN;
  _refund_bucket TEXT;
  _diamond_reward bigint;
  _swift_payment_id text;
BEGIN
  IF NOT public.is_caller_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO _w FROM public.agency_withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF _status = 'approved' THEN
    IF _w.status NOT IN ('pending', 'processing', 'completed', 'approved') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid approval transition');
    END IF;

    SELECT a.owner_id INTO _agency_owner_id FROM public.agencies a WHERE a.id = _w.agency_id;
    SELECT EXISTS(
      SELECT 1 FROM public.topup_helpers th
      WHERE th.user_id = _agency_owner_id AND th.is_verified = true AND th.payroll_enabled = true
    ) INTO _is_payroll_helper;

    IF NOT _is_payroll_helper THEN
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
      UPDATE public.agencies SET commission_rate = 3, level = 'A1', updated_at = NOW()
      WHERE id = _w.agency_id;
    END IF;

    _diamond_reward := COALESCE(_w.net_diamonds_to_helper, 0);
    IF _w.assigned_helper_id IS NOT NULL
       AND _w.helper_diamonds_credited = false
       AND _diamond_reward > 0 THEN
      SELECT user_id INTO _helper_user_id FROM public.topup_helpers WHERE id = _w.assigned_helper_id;

      IF _helper_user_id IS NOT NULL THEN
        -- Pkg427: credit once, to profiles.coins (My Diamond). Was double-crediting both coins AND diamonds.
        PERFORM set_config('app.bypass_profile_protection', 'true', true);
        UPDATE public.profiles
        SET coins = COALESCE(coins, 0) + _diamond_reward
        WHERE id = _helper_user_id;
        PERFORM set_config('app.bypass_profile_protection', 'false', true);

        INSERT INTO public.notifications (user_id, type, title, message, data)
        VALUES (
          _helper_user_id,
          'payroll_diamond_reward',
          '💎 Diamond Reward Credited!',
          'You received ' || _diamond_reward || ' diamonds for completing an agency withdrawal.',
          jsonb_build_object('withdrawal_id', _withdrawal_id, 'diamonds', _diamond_reward)
        );
      END IF;

      UPDATE public.agency_withdrawals
      SET status                   = 'approved',
          notes                    = COALESCE(_notes, notes),
          processed_at             = NOW(),
          processed_by             = auth.uid(),
          helper_diamonds_credited = true,
          updated_at               = now()
      WHERE id = _withdrawal_id;
    ELSE
      UPDATE public.agency_withdrawals
      SET status       = 'approved',
          notes        = COALESCE(_notes, notes),
          processed_at = COALESCE(processed_at, NOW()),
          processed_by = COALESCE(processed_by, auth.uid()),
          updated_at   = now()
      WHERE id = _withdrawal_id;
    END IF;

    IF _agency_owner_id IS NOT NULL AND _w.status <> 'approved' THEN
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (
        _agency_owner_id,
        'withdrawal_approved',
        '✅ Withdrawal Approved!',
        'Your withdrawal of ' || _w.amount::TEXT || ' beans has been approved and paid.',
        jsonb_build_object('withdrawal_id', _withdrawal_id, 'amount', _w.amount)
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Withdrawal approved',
      'diamonds_given', CASE WHEN _w.helper_diamonds_credited THEN 0 ELSE _diamond_reward END
    );

  ELSIF _status = 'rejected' THEN
    IF _w.status <> 'pending' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only pending unpaid withdrawals can be rejected/refunded');
    END IF;

    _swift_payment_id := NULLIF(_w.payment_details #>> '{swift_pay_payout,payment_id}', '');
    IF _swift_payment_id IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Gateway payout was already initiated; normal reject/refund is blocked');
    END IF;

    UPDATE public.agency_withdrawals
    SET status = 'rejected', notes = _notes, processed_at = NOW(), processed_by = auth.uid(), updated_at = now()
    WHERE id = _withdrawal_id AND status = 'pending';

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Withdrawal already changed; refresh and try again');
    END IF;

    _refund_bucket := COALESCE(_w.payment_details->>'source_balance_bucket', 'wallet_balance');
    IF _refund_bucket NOT IN ('wallet_balance', 'beans_balance') THEN
      _refund_bucket := 'wallet_balance';
    END IF;

    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
    IF _refund_bucket = 'beans_balance' THEN
      UPDATE public.agencies SET beans_balance = COALESCE(beans_balance, 0) + _w.amount, updated_at = NOW()
      WHERE id = _w.agency_id;
    ELSE
      UPDATE public.agencies SET wallet_balance = COALESCE(wallet_balance, 0) + _w.amount, updated_at = NOW()
      WHERE id = _w.agency_id;
    END IF;

    SELECT a.owner_id INTO _agency_owner_id FROM public.agencies a WHERE a.id = _w.agency_id;
    IF _agency_owner_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, data)
      VALUES (
        _agency_owner_id,
        'withdrawal_rejected',
        '❌ Withdrawal Rejected',
        'Your withdrawal of ' || _w.amount::TEXT || ' beans has been refunded.',
        jsonb_build_object('withdrawal_id', _withdrawal_id, 'amount', _w.amount, 'notes', _notes, 'refund_bucket', _refund_bucket)
      );
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Withdrawal rejected');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Unsupported status: ' || _status);
  END IF;
END;
$function$;

-- Same fix in approve_agency_withdrawal
CREATE OR REPLACE FUNCTION public.approve_agency_withdrawal(_withdrawal_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _w record;
BEGIN
  IF NOT (
    is_admin(auth.uid())
    OR is_active_admin_session()
    OR EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true)
  ) THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO _w FROM agency_withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Withdrawal not found');
  END IF;

  IF _w.status NOT IN ('completed', 'approved') THEN
    RETURN json_build_object('success', false, 'error', 'Withdrawal not yet processed by helper');
  END IF;

  IF _w.assigned_helper_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No helper assigned to this withdrawal');
  END IF;

  IF _w.helper_diamonds_credited = false AND COALESCE(_w.net_diamonds_to_helper, 0) > 0 THEN
    -- Pkg427: credit once, to profiles.coins. Was double-crediting both coins AND diamonds.
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE profiles
    SET coins = COALESCE(coins, 0) + _w.net_diamonds_to_helper
    WHERE id = (SELECT user_id FROM topup_helpers WHERE id = _w.assigned_helper_id);
    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    UPDATE agency_withdrawals
    SET helper_diamonds_credited = true,
        status                   = 'approved',
        processed_at             = now(),
        processed_by             = auth.uid(),
        updated_at               = now()
    WHERE id = _withdrawal_id;

    INSERT INTO notifications (user_id, type, title, body, data)
    SELECT
      th.user_id,
      'payroll_diamond_reward',
      '💎 Diamond Reward Credited!',
      'You received ' || _w.net_diamonds_to_helper || ' diamonds for completing an agency withdrawal.',
      jsonb_build_object('withdrawal_id', _withdrawal_id, 'diamonds', _w.net_diamonds_to_helper)
    FROM topup_helpers th
    WHERE th.id = _w.assigned_helper_id;
  ELSE
    UPDATE agency_withdrawals
    SET status       = 'approved',
        processed_at = COALESCE(processed_at, now()),
        processed_by = COALESCE(processed_by, auth.uid()),
        updated_at   = now()
    WHERE id = _withdrawal_id;
  END IF;

  INSERT INTO admin_logs (admin_id, action_type, target_id, target_type, details)
  VALUES (
    auth.uid()::text,
    'approve_agency_withdrawal',
    _withdrawal_id::text,
    'withdrawal',
    jsonb_build_object(
      'amount_beans',          _w.amount,
      'diamonds_to_helper',    _w.net_diamonds_to_helper,
      'helper_id',             _w.assigned_helper_id,
      'agency_id',             _w.agency_id,
      'already_credited',      _w.helper_diamonds_credited
    )
  );

  RETURN json_build_object(
    'success', true,
    'diamonds_given', CASE WHEN _w.helper_diamonds_credited THEN 0 ELSE _w.net_diamonds_to_helper END
  );
END;
$function$;