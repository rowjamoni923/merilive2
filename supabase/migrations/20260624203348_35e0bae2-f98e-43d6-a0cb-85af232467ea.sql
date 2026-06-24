
-- 1) Snapshot columns on the agency earnings transfer
ALTER TABLE public.agency_earnings_transfers
  ADD COLUMN IF NOT EXISTS contact_violation_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contact_violation_beans_deducted BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contact_violations_detail JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2) Helper: per-host weekly window start (last successful weekly transfer, else 7 days back)
CREATE OR REPLACE FUNCTION public.get_host_violation_week_start(p_host_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT MAX(period_end)
       FROM public.agency_earnings_transfers
      WHERE host_id = p_host_id
        AND status = 'completed'),
    now() - interval '7 days'
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_host_violation_week_start(UUID) TO authenticated, service_role;

-- 3) Replace process_contact_violation: weekly counter, flat 2000, ban on 11th-in-week
CREATE OR REPLACE FUNCTION public.process_contact_violation(
    p_host_id UUID,
    p_detected_content TEXT,
    p_detected_pattern TEXT,
    p_source_type TEXT,
    p_source_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_start          TIMESTAMPTZ;
  v_weekly_count        INTEGER;
  v_new_weekly_number   INTEGER;
  v_flat_deduction      INTEGER := 2000;   -- locked: 2,000 beans per violation
  v_weekly_ban_threshold INTEGER := 10;    -- ban triggers on the 11th in week
  v_beans_deducted      INTEGER := 0;
  v_is_banned           BOOLEAN := false;
  v_latest_violation_id UUID;
  v_safe_source_id      UUID := NULL;
  v_device_id           TEXT;
BEGIN
  IF p_source_id IS NOT NULL AND p_source_id <> '' THEN
    BEGIN
      v_safe_source_id := p_source_id::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_safe_source_id := NULL;
    END;
  END IF;

  -- Weekly window (per-host, reset on every weekly transfer)
  v_week_start := public.get_host_violation_week_start(p_host_id);

  SELECT COUNT(*) INTO v_weekly_count
    FROM public.host_contact_violations
   WHERE host_id = p_host_id
     AND created_at > v_week_start;

  v_new_weekly_number := v_weekly_count + 1;

  -- 11th-in-week => permanent ban + device ban
  IF v_new_weekly_number > v_weekly_ban_threshold THEN
    v_is_banned     := true;
    v_beans_deducted := 0;

    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
       SET is_blocked     = true,
           blocked_reason = 'Auto-banned: more than 10 contact-sharing violations in one week',
           blocked_at     = now(),
           updated_at     = now()
     WHERE id = p_host_id
     RETURNING device_id INTO v_device_id;
    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    -- Add the account's device to the global banned-device list so the same
    -- handset cannot create a fresh account until factory-reset.
    IF v_device_id IS NOT NULL AND v_device_id <> '' THEN
      INSERT INTO public.banned_devices (device_id, user_id, reason, is_active)
      VALUES (v_device_id, p_host_id,
              'Auto-banned: host exceeded 10 contact-sharing violations in one week',
              true)
      ON CONFLICT (device_id) DO UPDATE
        SET is_active = true,
            reason    = EXCLUDED.reason,
            user_id   = EXCLUDED.user_id,
            banned_at = now();
    END IF;
  ELSE
    -- Flat 2,000-bean deduction. Allowed to go negative; recovers as host earns.
    v_beans_deducted := v_flat_deduction;

    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
       SET weekly_earnings  = COALESCE(weekly_earnings,  0) - v_beans_deducted,
           pending_earnings = COALESCE(pending_earnings, 0) - v_beans_deducted,
           beans            = COALESCE(beans,            0) - v_beans_deducted,
           updated_at       = now()
     WHERE id = p_host_id;
    PERFORM set_config('app.bypass_profile_protection', 'false', true);
  END IF;

  -- Record violation (history rows are NEVER purged; window logic uses created_at)
  INSERT INTO public.host_contact_violations (
    host_id, violation_number, violation_type, detected_content,
    detected_pattern, source_type, source_id, beans_deducted, is_auto_detected
  ) VALUES (
    p_host_id, v_new_weekly_number, 'contact_sharing', p_detected_content,
    p_detected_pattern, p_source_type, p_source_id, v_beans_deducted, true
  )
  RETURNING id INTO v_latest_violation_id;

  INSERT INTO public.chat_moderation_logs (
    user_id, violation_type, detected_content, conversation_id,
    action_taken, is_auto_action, notes
  ) VALUES (
    p_host_id, p_detected_pattern, p_detected_content, v_safe_source_id,
    CASE WHEN v_is_banned THEN 'account_banned'
         ELSE 'beans_deducted_' || v_beans_deducted::TEXT
    END,
    true,
    format('Weekly violation #%s (window start %s) | -%s beans',
           v_new_weekly_number, v_week_start, v_beans_deducted)
  );

  RETURN jsonb_build_object(
    'success', true,
    'violation_id', v_latest_violation_id,
    'violation_number', v_new_weekly_number, -- weekly number, NOT lifetime
    'beans_deducted',  v_beans_deducted,
    'is_banned',       v_is_banned,
    'week_start',      v_week_start
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_contact_violation TO anon, authenticated, service_role;

-- 4) Replace weekly transfer to snapshot violation summary onto each transfer row.
CREATE OR REPLACE FUNCTION public.process_weekly_agency_transfers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _host RECORD;
  _agency_count integer := 0;
  _solo_count integer := 0;
  _total_to_agency_wallet bigint := 0;
  _total_to_solo_personal bigint := 0;
  _period_start timestamp;
  _period_end timestamp;
  _host_earning bigint;
  _caller text;
  _scheduler_bypass boolean;
  _v_count integer;
  _v_beans bigint;
  _v_detail jsonb;
  _v_window_start timestamptz;
BEGIN
  _caller := COALESCE(auth.role(), '');
  BEGIN
    _scheduler_bypass := COALESCE(current_setting('app.weekly_transfer_scheduler', true), '') = 'true';
  EXCEPTION WHEN OTHERS THEN _scheduler_bypass := false; END;

  IF NOT _scheduler_bypass
     AND _caller <> 'service_role'
     AND NOT public.is_admin(auth.uid())
     AND NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Unauthorized: weekly transfer is service/admin only';
  END IF;

  _period_start := date_trunc('week', now() - interval '7 days');
  _period_end   := date_trunc('week', now());

  FOR _host IN
    SELECT p.id, p.display_name, p.app_uid,
           ah.agency_id, a.name AS agency_name,
           COALESCE(p.pending_earnings, 0)::bigint AS pending
      FROM public.profiles p
      JOIN public.agency_hosts ah ON ah.host_id = p.id AND ah.status = 'active'
      JOIN public.agencies a      ON a.id = ah.agency_id AND a.is_active = true
     WHERE COALESCE(p.pending_earnings, 0) > 0
  LOOP
    _host_earning := _host.pending;

    -- Weekly window for this host (= since last transfer, else 7 days)
    _v_window_start := public.get_host_violation_week_start(_host.id);

    SELECT COUNT(*),
           COALESCE(SUM(beans_deducted), 0)::bigint,
           COALESCE(
             jsonb_agg(
               jsonb_build_object(
                 'id',           id,
                 'pattern',      detected_pattern,
                 'source',       source_type,
                 'beans',        beans_deducted,
                 'at',           created_at
               ) ORDER BY created_at
             ),
             '[]'::jsonb
           )
      INTO _v_count, _v_beans, _v_detail
      FROM public.host_contact_violations
     WHERE host_id = _host.id
       AND created_at > _v_window_start;

    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
       SET pending_earnings = 0,
           weekly_earnings  = 0,
           updated_at = now()
     WHERE id = _host.id;
    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    PERFORM set_config('app.bypass_agency_economy_guard', 'true', true);
    UPDATE public.agencies
       SET wallet_balance = COALESCE(wallet_balance, 0) + _host_earning,
           updated_at = now()
     WHERE id = _host.agency_id;
    PERFORM set_config('app.bypass_agency_economy_guard', 'false', true);

    INSERT INTO public.agency_earnings_transfers (
      agency_id, host_id, host_name, host_uid, amount,
      commission_rate, transfer_type, status,
      period_start, period_end, agency_name, notes,
      contact_violation_count, contact_violation_beans_deducted, contact_violations_detail
    )
    VALUES (
      _host.agency_id, _host.id, _host.display_name, _host.app_uid,
      _host_earning, 0, 'weekly_auto', 'completed',
      _period_start, _period_end, _host.agency_name,
      'Weekly host earnings transferred to agency Total Beans. Commission paid separately after delay.',
      _v_count, _v_beans, _v_detail
    );

    _total_to_agency_wallet := _total_to_agency_wallet + _host_earning;
    _agency_count := _agency_count + 1;
  END LOOP;

  -- Solo hosts (no agency) – unchanged behavior
  FOR _host IN
    SELECT p.id, COALESCE(p.pending_earnings, 0)::bigint AS pending
      FROM public.profiles p
     WHERE COALESCE(p.pending_earnings, 0) > 0
       AND NOT EXISTS (
         SELECT 1 FROM public.agency_hosts ah
          JOIN public.agencies a ON a.id = ah.agency_id AND a.is_active = true
         WHERE ah.host_id = p.id AND ah.status = 'active'
       )
  LOOP
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
       SET beans = COALESCE(beans, 0) + _host.pending,
           pending_earnings = 0,
           weekly_earnings  = 0,
           updated_at = now()
     WHERE id = _host.id;
    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    _total_to_solo_personal := _total_to_solo_personal + _host.pending;
    _solo_count := _solo_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'agency_hosts_processed', _agency_count,
    'solo_hosts_processed',   _solo_count,
    'total_to_agency_wallet', _total_to_agency_wallet,
    'total_to_solo_personal', _total_to_solo_personal,
    'period_start', _period_start,
    'period_end',   _period_end
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.process_weekly_agency_transfers TO authenticated, service_role;
