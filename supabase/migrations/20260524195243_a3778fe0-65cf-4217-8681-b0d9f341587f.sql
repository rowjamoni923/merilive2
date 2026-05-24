
-- ============================================================
-- 1. SECURE claim_new_host_live_bonus
-- ============================================================
-- Drop both signatures (old one with _bonus_coins param)
DROP FUNCTION IF EXISTS public.claim_new_host_live_bonus(uuid, integer);
DROP FUNCTION IF EXISTS public.claim_new_host_live_bonus(uuid);

CREATE OR REPLACE FUNCTION public.claim_new_host_live_bonus()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _host_id uuid;
  _profile RECORD;
  _stream_count int;
  _admin_bonus int := 0;
BEGIN
  _host_id := auth.uid();
  IF _host_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO _profile FROM public.profiles WHERE id = _host_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  IF _profile.is_host IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not a host');
  END IF;
  IF COALESCE(_profile.new_host_bonus_claimed, false) = true THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bonus already claimed');
  END IF;

  SELECT COUNT(*) INTO _stream_count
  FROM public.live_streams
  WHERE host_id = _host_id AND ended_at IS NOT NULL;
  IF _stream_count < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Must complete at least 1 live stream');
  END IF;

  -- Admin-configured amount only — no client input accepted
  SELECT COALESCE(SUM(bonus_amount), 0)::int INTO _admin_bonus
  FROM public.new_host_live_bonus_settings
  WHERE is_active = true AND day_number = 1;

  IF _admin_bonus <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bonus is not configured by admin');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET coins = COALESCE(coins, 0) + _admin_bonus,
         new_host_bonus_claimed = true,
         updated_at = now()
   WHERE id = _host_id;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    _host_id, 'bonus',
    '🎉 New Host Bonus!',
    'Congratulations! You received ' || _admin_bonus || ' coins as your new host bonus.',
    jsonb_build_object('bonus_coins', _admin_bonus, 'type', 'new_host_bonus')
  );

  RETURN jsonb_build_object('success', true, 'bonus_coins', _admin_bonus);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_new_host_live_bonus() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_new_host_live_bonus() TO authenticated;

-- ============================================================
-- 2. FIX process_weekly_agency_transfers — apply commission split
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_weekly_agency_transfers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _host RECORD;
  _transfer_count integer := 0;
  _total_transferred numeric := 0;
  _period_start timestamp;
  _period_end timestamp;
  _agency_rate numeric;
  _host_share bigint;
  _agency_share bigint;
BEGIN
  _period_start := date_trunc('week', now() - interval '7 days');
  _period_end   := date_trunc('week', now());

  FOR _host IN
    SELECT p.id, p.display_name, p.app_uid,
           ah.agency_id, a.name AS agency_name,
           COALESCE(a.commission_rate, 30)::numeric AS commission_rate,
           COALESCE(p.pending_earnings, 0)::bigint AS pending
      FROM public.profiles p
      JOIN public.agency_hosts ah ON ah.host_id = p.id AND ah.status = 'active'
      JOIN public.agencies a      ON a.id = ah.agency_id AND a.is_active = true
     WHERE COALESCE(p.pending_earnings, 0) > 0
  LOOP
    -- Sanity-clamp commission to [0,100]
    _agency_rate  := LEAST(100, GREATEST(0, _host.commission_rate));
    _agency_share := FLOOR(_host.pending::numeric * _agency_rate / 100.0)::bigint;
    _host_share   := _host.pending - _agency_share;

    -- Ledger row (records BOTH shares for reconciliation)
    INSERT INTO public.agency_earnings_transfers (
      agency_id, host_id, host_name, host_uid, amount,
      commission_rate, transfer_type, status,
      period_start, period_end, agency_name
    )
    VALUES (
      _host.agency_id, _host.id, _host.display_name, _host.app_uid,
      _agency_share, _agency_rate, 'weekly_auto', 'completed',
      _period_start, _period_end, _host.agency_name
    );

    -- Agency receives only its commission share
    IF _agency_share > 0 THEN
      UPDATE public.agencies
         SET beans_balance = COALESCE(beans_balance, 0) + _agency_share
       WHERE id = _host.agency_id;
    END IF;

    -- Host KEEPS their share in spendable beans balance + clears pending/weekly
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
       SET beans = COALESCE(beans, 0) + _host_share,
           pending_earnings = 0,
           weekly_earnings  = 0,
           updated_at = now()
     WHERE id = _host.id;
    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    _transfer_count := _transfer_count + 1;
    _total_transferred := _total_transferred + _host.pending;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'transfers', _transfer_count,
    'total_period_amount', _total_transferred,
    'period_start', _period_start,
    'period_end', _period_end
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_weekly_agency_transfers() FROM PUBLIC, anon, authenticated;
-- Only service-role / cron / admin edge fn may invoke
