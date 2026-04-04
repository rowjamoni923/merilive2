CREATE OR REPLACE FUNCTION public.deduct_coins_atomic(
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_balance INTEGER;
  rows_affected INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Atomic deduction: only succeeds if coins >= p_amount
  UPDATE profiles
  SET coins = coins - p_amount
  WHERE id = p_user_id
    AND coins >= p_amount
  RETURNING coins INTO result_balance;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;

  IF rows_affected = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'new_balance', 0);
  ELSE
    RETURN jsonb_build_object('success', true, 'new_balance', result_balance);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_task_progress(
  _task_type text,
  _value integer DEFAULT NULL,
  _increment integer DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5s'
AS $$
DECLARE
  _user_id uuid;
  _today text;
  _task RECORD;
  _new_progress integer;
  _is_completed boolean;
  _is_host boolean;
  _has_active_stream boolean;
  _results jsonb := '[]'::jsonb;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  _today := to_char((now() AT TIME ZONE 'UTC' - interval '30 minutes')::date, 'YYYY-MM-DD');

  IF _task_type IN ('first_live', 'live_minutes', 'viewers', 'first_gift') THEN
    SELECT is_host INTO _is_host FROM profiles WHERE id = _user_id;
    IF NOT COALESCE(_is_host, false) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not a host');
    END IF;
    SELECT EXISTS(
      SELECT 1 FROM live_streams 
      WHERE host_id = _user_id AND is_active = true AND ended_at IS NULL
        AND created_at > now() - interval '24 hours'
    ) INTO _has_active_stream;
    IF NOT _has_active_stream THEN
      RETURN jsonb_build_object('success', false, 'error', 'No active live stream');
    END IF;
  END IF;

  FOR _task IN 
    SELECT id, requirement_value FROM daily_tasks 
    WHERE requirement_type = _task_type AND is_active = true
  LOOP
    IF _value IS NOT NULL THEN
      _new_progress := _value;
    ELSIF _increment IS NOT NULL THEN
      _new_progress := _increment;
    ELSE
      _new_progress := 1;
    END IF;

    _is_completed := _new_progress >= _task.requirement_value;

    INSERT INTO user_task_progress (user_id, task_id, reset_date, current_progress, is_completed)
    VALUES (_user_id, _task.id, _today, _new_progress, _is_completed)
    ON CONFLICT (user_id, task_id, reset_date) DO UPDATE SET
      current_progress = CASE
        WHEN user_task_progress.is_claimed THEN user_task_progress.current_progress
        WHEN _value IS NOT NULL THEN GREATEST(user_task_progress.current_progress, _value)
        ELSE COALESCE(user_task_progress.current_progress, 0) + COALESCE(_increment, 1)
      END,
      is_completed = CASE
        WHEN user_task_progress.is_claimed THEN user_task_progress.is_completed
        ELSE (CASE
          WHEN _value IS NOT NULL THEN GREATEST(user_task_progress.current_progress, _value)
          ELSE COALESCE(user_task_progress.current_progress, 0) + COALESCE(_increment, 1)
        END) >= _task.requirement_value
      END,
      updated_at = now()
    RETURNING current_progress, is_completed
    INTO _new_progress, _is_completed;

    _results := _results || jsonb_build_object('task_id', _task.id, 'progress', _new_progress, 'completed', _is_completed);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'tasks', _results);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_task_progress TO authenticated;
"}		rjboss923@gmail.com	\N	\N
20260227130504	{"
DROP FUNCTION IF EXISTS public.update_task_progress(text, integer, integer);
CREATE FUNCTION public.update_task_progress(_task_type text, _value integer DEFAULT NULL, _increment integer DEFAULT NULL) RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '5s' AS $$ DECLARE _user_id uuid;

CREATE OR REPLACE FUNCTION public.protect_task_progress_writes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow if inside a SECURITY DEFINER function context
  IF current_user IS DISTINCT FROM session_user THEN
    RETURN NEW;
  END IF;

  -- Block direct writes from authenticated users
  RAISE EXCEPTION 'Direct modification of task progress is not allowed. Use the update_task_progress function.';
END;
$$;

CREATE OR REPLACE FUNCTION public.roulette_spin_wheel(p_session_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _session RECORD;
  _winning_number INT;
BEGIN
  -- Lock the row and only transition if still in 'betting' status
  SELECT * INTO _session 
  FROM roulette_sessions 
  WHERE id = p_session_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'session_not_found');
  END IF;

  -- Already spinning or completed - ignore duplicate calls
  IF _session.status != 'betting' THEN
    RETURN jsonb_build_object('success', true, 'already_processed', true, 'winning_number', _session.winning_number);
  END IF;

  _winning_number := floor(random() * 37)::int;

  UPDATE roulette_sessions 
  SET status = 'spinning', winning_number = _winning_number
  WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true, 'winning_number', _winning_number);
END;
$$;

CREATE OR REPLACE FUNCTION public.roulette_complete_session(p_session_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _session RECORD;
BEGIN
  SELECT * INTO _session 
  FROM roulette_sessions 
  WHERE id = p_session_id 
  FOR UPDATE;

  IF NOT FOUND OR _session.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true);
  END IF;

  UPDATE roulette_sessions 
  SET status = 'completed', completed_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.roulette_get_or_create_session(p_duration_seconds INT DEFAULT 25)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _session RECORD;
  _new_id UUID;
  _betting_ends_at TIMESTAMPTZ;
BEGIN
  -- Find active session
  SELECT * INTO _session 
  FROM roulette_sessions 
  WHERE status IN ('betting', 'spinning')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- Check if stale (betting ended more than 60s ago)
    IF _session.betting_ends_at IS NOT NULL 
       AND _session.betting_ends_at < now() - interval '60 seconds' THEN
      -- Mark stale as completed
      UPDATE roulette_sessions 
      SET status = 'completed', completed_at = now(), 
          winning_number = COALESCE(winning_number, floor(random() * 37)::int)
      WHERE id = _session.id;
    ELSE
      -- Return existing active session
      RETURN jsonb_build_object(
        'success', true, 
        'session_id', _session.id,
        'status', _session.status,
        'winning_number', _session.winning_number,
        'betting_ends_at', _session.betting_ends_at,
        'created', false
      );
    END IF;
  END IF;

  -- Clean up any other stale sessions
  UPDATE roulette_sessions 
  SET status = 'completed', completed_at = now(),
      winning_number = COALESCE(winning_number, floor(random() * 37)::int)
  WHERE status IN ('betting', 'spinning')
    AND betting_ends_at < now() - interval '60 seconds';

  -- Create new session
  _new_id := gen_random_uuid();
  _betting_ends_at := now() + (p_duration_seconds || ' seconds')::interval;

  INSERT INTO roulette_sessions (id, status, betting_ends_at)
  VALUES (_new_id, 'betting', _betting_ends_at);

  RETURN jsonb_build_object(
    'success', true,
    'session_id', _new_id,
    'status', 'betting',
    'winning_number', NULL,
    'betting_ends_at', _betting_ends_at,
    'created', true
  );
END;
$$;
"}		rjboss923@gmail.com	\N	\N
20260226173636	{"
-- Retroactively credit missing beans from task rewards
-- These users claimed rewards but beans only went to total_earnings, not beans column
UPDATE profiles p
SET beans = COALESCE(p.beans, 0) + claimed.total_claimed_beans
FROM (
  SELECT 
    utp.user_id,
    SUM(dt.reward_beans) as total_claimed_beans
  FROM user_task_progress utp
  JOIN daily_tasks dt ON dt.id = utp.task_id
  WHERE utp.is_claimed = true AND dt.reward_beans > 0
  GROUP BY utp.user_id
) claimed
WHERE p.id = claimed.user_id;
"}		rjboss923@gmail.com	\N	\N
20260226182634	{"-- Fix all verified Level 5 payroll helpers whose agencies are stuck at A1/3%
-- They should be A5/12% as per business rules
UPDATE agencies
SET level = 'A5', commission_rate = 12.00
WHERE owner_id IN (
  SELECT user_id FROM topup_helpers 
  WHERE is_verified = true 
  AND payroll_enabled = true 
  AND trader_level = 5
)
AND (level != 'A5' OR commission_rate != 12.00);
"}		rjboss923@gmail.com	\N	\N
20260226183030	{"-- Drop and recreate with correct return type
DROP FUNCTION IF EXISTS recalculate_all_agency_levels();

CREATE OR REPLACE FUNCTION recalculate_all_agency_levels()
RETURNS json AS $$
DECLARE
  _agency RECORD;
  _current_week_income NUMERIC;
  _prev_week_income NUMERIC;
  _final_income NUMERIC;
  _new_level TEXT;
  _new_rate NUMERIC;
  _updated_count INT := 0;
  _is_payroll_helper BOOLEAN;
BEGIN
  FOR _agency IN SELECT id, level, commission_rate, owner_id FROM agencies WHERE is_active = true
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM topup_helpers 
      WHERE user_id = _agency.owner_id 
        AND is_verified = true 
        AND trader_level = 5 
        AND payroll_enabled = true
    ) INTO _is_payroll_helper;

    IF _is_payroll_helper THEN
      IF _agency.level IS NULL OR _agency.level != 'A5' OR _agency.commission_rate != 12 THEN
        UPDATE agencies SET level = 'A5', commission_rate = 12, updated_at = now()
        WHERE id = _agency.id;
        _updated_count := _updated_count + 1;
      END IF;
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(total_income), 0) INTO _current_week_income
    FROM agency_performance 
    WHERE agency_id = _agency.id 
      AND period_type = 'weekly'
      AND period_start >= date_trunc('week', now());

    SELECT COALESCE(SUM(total_income), 0) INTO _prev_week_income
    FROM agency_performance 
    WHERE agency_id = _agency.id 
      AND period_type = 'weekly'
      AND period_start >= date_trunc('week', now()) - interval '7 days'
      AND period_start < date_trunc('week', now());

    _final_income := GREATEST(_current_week_income, _prev_week_income);

    SELECT level_code, commission_rate 
    INTO _new_level, _new_rate
    FROM agency_level_tiers
    WHERE _final_income >= min_weekly_income 
      AND _final_income <= max_weekly_income
      AND is_active = true
    ORDER BY min_weekly_income DESC
    LIMIT 1;

    IF _new_level IS NULL THEN
      SELECT level_code, commission_rate INTO _new_level, _new_rate
      FROM agency_level_tiers WHERE level_code = 'A1' AND is_active = true LIMIT 1;
    END IF;

    IF _new_level IS NOT NULL AND (_agency.level IS NULL OR _agency.level != _new_level) THEN
      UPDATE agencies SET level = _new_level, commission_rate = _new_rate, updated_at = now()
      WHERE id = _agency.id;
      _updated_count := _updated_count + 1;
    END IF;
  END LOOP;

  RETURN json_build_object('success', true, 'updated_agencies', _updated_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.check_agency_minimum_hosts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delegate to the unified compliance function
  PERFORM check_agency_host_compliance();
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_country_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country_name TEXT;
  v_country_flag TEXT;
  v_code TEXT;
BEGIN
  v_code := UPPER(COALESCE(NEW.country_code, ''));
  
  -- Only act if country_code actually changed
  IF v_code = UPPER(COALESCE(OLD.country_code, '')) AND TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;
  
  IF v_code = '' THEN
    RETURN NEW;
  END IF;

  -- Master English country name mapping
  v_country_name := CASE v_code
    WHEN 'AF' THEN 'Afghanistan'
    WHEN 'AL' THEN 'Albania'
    WHEN 'DZ' THEN 'Algeria'
    WHEN 'AR' THEN 'Argentina'
    WHEN 'AM' THEN 'Armenia'
    WHEN 'AU' THEN 'Australia'
    WHEN 'AT' THEN 'Austria'
    WHEN 'AZ' THEN 'Azerbaijan'
    WHEN 'BH' THEN 'Bahrain'
    WHEN 'BD' THEN 'Bangladesh'
    WHEN 'BY' THEN 'Belarus'
    WHEN 'BE' THEN 'Belgium'
    WHEN 'BJ' THEN 'Benin'
    WHEN 'BT' THEN 'Bhutan'
    WHEN 'BO' THEN 'Bolivia'
    WHEN 'BA' THEN 'Bosnia and Herzegovina'
    WHEN 'BR' THEN 'Brazil'
    WHEN 'BN' THEN 'Brunei'
    WHEN 'BG' THEN 'Bulgaria'
    WHEN 'BF' THEN 'Burkina Faso'
    WHEN 'KH' THEN 'Cambodia'
    WHEN 'CM' THEN 'Cameroon'
    WHEN 'CA' THEN 'Canada'
    WHEN 'CF' THEN 'Central African Republic'
    WHEN 'TD' THEN 'Chad'
    WHEN 'CL' THEN 'Chile'
    WHEN 'CN' THEN 'China'
    WHEN 'CO' THEN 'Colombia'
    WHEN 'CD' THEN 'Congo'
    WHEN 'CR' THEN 'Costa Rica'
    WHEN 'HR' THEN 'Croatia'
    WHEN 'CU' THEN 'Cuba'
    WHEN 'CY' THEN 'Cyprus'
    WHEN 'CZ' THEN 'Czech Republic'
    WHEN 'DK' THEN 'Denmark'
    WHEN 'DJ' THEN 'Djibouti'
    WHEN 'DO' THEN 'Dominican Republic'
    WHEN 'EC' THEN 'Ecuador'
    WHEN 'EG' THEN 'Egypt'
    WHEN 'SV' THEN 'El Salvador'
    WHEN 'GQ' THEN 'Equatorial Guinea'
    WHEN 'ER' THEN 'Eritrea'
    WHEN 'EE' THEN 'Estonia'
    WHEN 'ET' THEN 'Ethiopia'
    WHEN 'FI' THEN 'Finland'
    WHEN 'FR' THEN 'France'
    WHEN 'GA' THEN 'Gabon'
    WHEN 'GM' THEN 'Gambia'
    WHEN 'GE' THEN 'Georgia'
    WHEN 'DE' THEN 'Germany'
    WHEN 'GH' THEN 'Ghana'
    WHEN 'GR' THEN 'Greece'
    WHEN 'GT' THEN 'Guatemala'
    WHEN 'GN' THEN 'Guinea'
    WHEN 'HT' THEN 'Haiti'
    WHEN 'HN' THEN 'Honduras'
    WHEN 'HK' THEN 'Hong Kong'
    WHEN 'HU' THEN 'Hungary'
    WHEN 'IS' THEN 'Iceland'
    WHEN 'IN' THEN 'India'
    WHEN 'ID' THEN 'Indonesia'
    WHEN 'IR' THEN 'Iran'
    WHEN 'IQ' THEN 'Iraq'
    WHEN 'IE' THEN 'Ireland'
    WHEN 'IL' THEN 'Israel'
    WHEN 'IT' THEN 'Italy'
    WHEN 'CI' THEN 'Ivory Coast'
    WHEN 'JM' THEN 'Jamaica'
    WHEN 'JP' THEN 'Japan'
    WHEN 'JO' THEN 'Jordan'
    WHEN 'KZ' THEN 'Kazakhstan'
    WHEN 'KE' THEN 'Kenya'
    WHEN 'KW' THEN 'Kuwait'
    WHEN 'KG' THEN 'Kyrgyzstan'
    WHEN 'LA' THEN 'Laos'
    WHEN 'LV' THEN 'Latvia'
    WHEN 'LB' THEN 'Lebanon'
    WHEN 'LR' THEN 'Liberia'
    WHEN 'LY' THEN 'Libya'
    WHEN 'LT' THEN 'Lithuania'
    WHEN 'LU' THEN 'Luxembourg'
    WHEN 'MO' THEN 'Macau'
    WHEN 'MG' THEN 'Madagascar'
    WHEN 'MW' THEN 'Malawi'
    WHEN 'MY' THEN 'Malaysia'
    WHEN 'MV' THEN 'Maldives'
    WHEN 'ML' THEN 'Mali'
    WHEN 'MT' THEN 'Malta'
    WHEN 'MR' THEN 'Mauritania'
    WHEN 'MU' THEN 'Mauritius'
    WHEN 'MX' THEN 'Mexico'
    WHEN 'MD' THEN 'Moldova'
    WHEN 'MN' THEN 'Mongolia'
    WHEN 'ME' THEN 'Montenegro'
    WHEN 'MA' THEN 'Morocco'
    WHEN 'MZ' THEN 'Mozambique'
    WHEN 'MM' THEN 'Myanmar'
    WHEN 'NA' THEN 'Namibia'
    WHEN 'NP' THEN 'Nepal'
    WHEN 'NL' THEN 'Netherlands'
    WHEN 'NZ' THEN 'New Zealand'
    WHEN 'NI' THEN 'Nicaragua'
    WHEN 'NE' THEN 'Niger'
    WHEN 'NG' THEN 'Nigeria'
    WHEN 'KP' THEN 'North Korea'
    WHEN 'MK' THEN 'North Macedonia'
    WHEN 'NO' THEN 'Norway'
    WHEN 'OM' THEN 'Oman'
    WHEN 'PK' THEN 'Pakistan'
    WHEN 'PS' THEN 'Palestine'
    WHEN 'PA' THEN 'Panama'
    WHEN 'PG' THEN 'Papua New Guinea'
    WHEN 'PY' THEN 'Paraguay'
    WHEN 'PE' THEN 'Peru'
    WHEN 'PH' THEN 'Philippines'
    WHEN 'PL' THEN 'Poland'
    WHEN 'PT' THEN 'Portugal'
    WHEN 'QA' THEN 'Qatar'
    WHEN 'RO' THEN 'Romania'
    WHEN 'RU' THEN 'Russia'
    WHEN 'RW' THEN 'Rwanda'
    WHEN 'SA' THEN 'Saudi Arabia'
    WHEN 'SN' THEN 'Senegal'
    WHEN 'RS' THEN 'Serbia'
    WHEN 'SL' THEN 'Sierra Leone'
    WHEN 'SG' THEN 'Singapore'
    WHEN 'SK' THEN 'Slovakia'
    WHEN 'SI' THEN 'Slovenia'
    WHEN 'SO' THEN 'Somalia'
    WHEN 'ZA' THEN 'South Africa'
    WHEN 'KR' THEN 'South Korea'
    WHEN 'SS' THEN 'South Sudan'
    WHEN 'ES' THEN 'Spain'
    WHEN 'LK' THEN 'Sri Lanka'
    WHEN 'SD' THEN 'Sudan'
    WHEN 'SR' THEN 'Suriname'
    WHEN 'SE' THEN 'Sweden'
    WHEN 'CH' THEN 'Switzerland'
    WHEN 'SY' THEN 'Syria'
    WHEN 'TW' THEN 'Taiwan'
    WHEN 'TJ' THEN 'Tajikistan'
    WHEN 'TZ' THEN 'Tanzania'
    WHEN 'TH' THEN 'Thailand'
    WHEN 'TG' THEN 'Togo'
    WHEN 'TN' THEN 'Tunisia'
    WHEN 'TR' THEN 'Turkey'
    WHEN 'TM' THEN 'Turkmenistan'
    WHEN 'UG' THEN 'Uganda'
    WHEN 'UA' THEN 'Ukraine'
    WHEN 'AE' THEN 'United Arab Emirates'
    WHEN 'GB' THEN 'United Kingdom'
    WHEN 'US' THEN 'United States'
    WHEN 'UY' THEN 'Uruguay'
    WHEN 'UZ' THEN 'Uzbekistan'
    WHEN 'VE' THEN 'Venezuela'
    WHEN 'VN' THEN 'Vietnam'
    WHEN 'YE' THEN 'Yemen'
    WHEN 'ZM' THEN 'Zambia'
    WHEN 'ZW' THEN 'Zimbabwe'
    ELSE v_code
  END;

  -- Generate flag emoji from country code
  v_country_flag := chr(127397 + ascii(substring(v_code from 1 for 1))) || chr(127397 + ascii(substring(v_code from 2 for 1)));

  NEW.country_name := v_country_name;
  NEW.country_flag := v_country_flag;
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_stale_in_call_flags()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 1. Reset is_in_call for users whose current_call_id points to an ended/missed/declined/cancelled call
  UPDATE profiles p
  SET is_in_call = false, current_call_id = NULL, updated_at = now()
  FROM private_calls pc
  WHERE p.current_call_id = pc.id
    AND p.is_in_call = true
    AND pc.status IN ('ended', 'missed', 'declined', 'cancelled');

  -- 2. Reset is_in_call for users whose current_call_id does not exist in private_calls
  UPDATE profiles p
  SET is_in_call = false, current_call_id = NULL, updated_at = now()
  WHERE p.is_in_call = true
    AND p.current_call_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM private_calls pc WHERE pc.id = p.current_call_id);

  -- 3. Force-end calls that have been \\"connected\\" for more than 30 SECONDS without ended_at
  -- This is the SAFETY NET - real call ending happens via end_private_call RPC
  UPDATE private_calls
  SET status = 'ended', ended_at = now(), end_reason = 'stale_cleanup'
  WHERE status = 'connected'
    AND started_at < now() - INTERVAL '30 seconds'
    AND ended_at IS NULL
    AND NOT EXISTS (
      -- Only end if NEITHER participant has this as their current_call_id with active heartbeat
      SELECT 1 FROM profiles p 
      WHERE p.current_call_id = private_calls.id 
        AND p.is_in_call = true
        AND p.last_seen_at > now() - INTERVAL '60 seconds'
    );

  -- 4. Force-end calls that have been \\"ringing/pending\\" for more than 60 seconds
  UPDATE private_calls
  SET status = 'missed', ended_at = now(), end_reason = 'stale_cleanup'
  WHERE status IN ('ringing', 'pending')
    AND started_at < now() - INTERVAL '60 seconds'
    AND ended_at IS NULL;

  -- 5. Reset is_in_call for users where is_in_call=true but current_call_id is NULL
  UPDATE profiles
  SET is_in_call = false, updated_at = now()
  WHERE is_in_call = true AND current_call_id IS NULL;

  -- 6. FINAL SWEEP: Re-check after ending stale calls above
  UPDATE profiles p
  SET is_in_call = false, current_call_id = NULL, updated_at = now()
  FROM private_calls pc
  WHERE p.current_call_id = pc.id
    AND p.is_in_call = true
    AND pc.status IN ('ended', 'missed', 'declined', 'cancelled');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user_gender(
  _user_id uuid,
  _new_gender text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  IF _new_gender NOT IN ('male', 'female', 'other') THEN
    RAISE EXCEPTION 'Invalid gender value';
  END IF;
  
  IF _new_gender = 'female' THEN
    -- Female = Host with full privileges
    UPDATE profiles
    SET gender = 'female',
        is_host = true,
        host_status = 'approved',
        is_face_verified = true,
        updated_at = now()
    WHERE id = _user_id;
  ELSE
    -- Male/Other = User, remove host privileges
    UPDATE profiles
    SET gender = _new_gender,
        is_host = false,
        host_status = null,
        is_face_verified = false,
        updated_at = now()
    WHERE id = _user_id;
  END IF;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  PERFORM public.log_admin_action(
    'update_gender',
    'profile',
    _user_id::text,
    jsonb_build_object('new_gender', _new_gender, 'synced_host', _new_gender = 'female')
  );
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_face_verification(
  _user_id uuid,
  _verified boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  UPDATE profiles
  SET 
    is_face_verified = _verified,
    is_verified = _verified,
    face_verified_at = CASE WHEN _verified THEN now() ELSE NULL END,
    face_verification_image = CASE WHEN _verified THEN face_verification_image ELSE NULL END,
    updated_at = now()
  WHERE id = _user_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  PERFORM public.log_admin_action(
    CASE WHEN _verified THEN 'enable_face_verification' ELSE 'disable_face_verification' END,
    'profile',
    _user_id,
    jsonb_build_object('verified', _verified)
  );
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_change_user_role(
  _user_id uuid,
  _new_role text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  IF _new_role NOT IN ('host', 'user') THEN
    RAISE EXCEPTION 'Invalid role value';
  END IF;
  
  IF _new_role = 'host' THEN
    UPDATE profiles
    SET is_host = true, host_status = 'approved', updated_at = now()
    WHERE id = _user_id;
  ELSE
    UPDATE profiles
    SET is_host = false, host_status = NULL, updated_at = now()
    WHERE id = _user_id;
  END IF;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  PERFORM public.log_admin_action(
    'change_user_role',
    'profile',
    _user_id,
    jsonb_build_object('new_role', _new_role)
  );
  
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_parent_agency_owner(_user_id uuid, _agency_parent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM agencies
    WHERE id = _agency_parent_id AND owner_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.cleanup_stale_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '10s'
AS $$
BEGIN
  -- Mark users offline if no activity for 5 minutes
  UPDATE profiles 
  SET is_online = false 
  WHERE is_online = true 
    AND last_active_at < NOW() - INTERVAL '5 minutes';

  -- End stale live streams (no heartbeat for 3 minutes)
  UPDATE live_streams 
  SET is_active = false, ended_at = NOW() 
  WHERE is_active = true 
    AND last_heartbeat < NOW() - INTERVAL '3 minutes';

  -- Deactivate stale device tokens (not updated for 90 days)
  UPDATE device_tokens 
  SET is_active = false 
  WHERE is_active = true 
    AND updated_at < NOW() - INTERVAL '90 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_user_task_progress(
  p_user_id UUID,
  p_task_id TEXT,
  p_reset_date TEXT,
  p_progress INTEGER DEFAULT 1,
  p_is_completed BOOLEAN DEFAULT FALSE,
  p_is_claimed BOOLEAN DEFAULT FALSE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_task_progress (user_id, task_id, reset_date, progress, is_completed, is_claimed)
  VALUES (p_user_id, p_task_id, p_reset_date, p_progress, p_is_completed, p_is_claimed)
  ON CONFLICT (user_id, task_id, reset_date) 
  DO UPDATE SET 
    progress = EXCLUDED.progress,
    is_completed = EXCLUDED.is_completed,
    is_claimed = EXCLUDED.is_claimed,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.broadcast_notice_to_users()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_record RECORD;
  v_is_helper_audience BOOLEAN;
  v_message TEXT;
  v_data JSONB;
  v_counter INT := 0;
BEGIN
  IF NOT NEW.is_active THEN
    RETURN NEW;
  END IF;

  -- Check if targeting helpers or agencies
  v_is_helper_audience := (
    'helpers' = ANY(NEW.target_audience) OR 
    'level5_helpers' = ANY(NEW.target_audience) OR 
    'agencies' = ANY(NEW.target_audience)
  );

  -- Auto-append Payroll Helper Guide link for helper/agency audiences
  IF v_is_helper_audience AND NEW.message NOT LIKE '%payroll-helper-guide%' THEN
    v_message := NEW.message || E'\\\
\\\
📖 Payroll Helper Guide: /payroll-helper-guide';
  ELSE
    v_message := NEW.message;
  END IF;

  FOR v_user_record IN
    SELECT DISTINCT p.id AS user_id
    FROM profiles p
    WHERE (
      'all' = ANY(NEW.target_audience)
      OR 'users' = ANY(NEW.target_audience)
      OR ('hosts' = ANY(NEW.target_audience) AND p.is_host = true)
    )
    
    UNION
    
    SELECT DISTINCT a.owner_id AS user_id
    FROM agencies a
    WHERE 'agencies' = ANY(NEW.target_audience)
      AND a.is_active = true
      AND a.owner_id IS NOT NULL
    
    UNION
    
    SELECT DISTINCT th.user_id
    FROM topup_helpers th
    WHERE 'helpers' = ANY(NEW.target_audience)
      AND th.is_verified = true
    
    UNION
    
    SELECT DISTINCT th.user_id
    FROM topup_helpers th
    WHERE 'level5_helpers' = ANY(NEW.target_audience)
      AND th.is_verified = true
      AND th.trader_level = 5
  LOOP
    v_counter := v_counter + 1;
    
    -- Build data with action_url for helper/agency audiences
    v_data := jsonb_build_object(
      'notice_id', NEW.id,
      'priority', NEW.priority,
      'target_audience', NEW.target_audience,
      'serial_number', v_counter
    );
    
    IF v_is_helper_audience THEN
      v_data := v_data || jsonb_build_object('action_url', '/payroll-helper-guide');
    END IF;

    INSERT INTO notifications (user_id, type, title, message, data, is_read)
    VALUES (
      v_user_record.user_id,
      'admin_message',
      NEW.title,
      v_message,
      v_data,
      false
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_recalc_host_level()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _new_level integer;
BEGIN
  -- Only for hosts when weekly_earnings changes
  IF NEW.is_host = true AND COALESCE(NEW.weekly_earnings, 0) IS DISTINCT FROM COALESCE(OLD.weekly_earnings, 0) THEN
    SELECT COALESCE(MAX(t.level_number), 0) INTO _new_level
    FROM user_level_tiers t
    WHERE t.tier_type = 'host'
      AND t.is_active = true
      AND t.min_earning_amount <= COALESCE(NEW.weekly_earnings, 0);
    
    -- Use previous level logic: never show lower than previous
    _new_level := GREATEST(_new_level, COALESCE(NEW.previous_host_level, 0));
    
    NEW.host_level := _new_level;
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_helper_on_admin_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _helper_user_id uuid;
BEGIN
  -- Get the helper's user_id from topup_helpers table
  SELECT user_id INTO _helper_user_id
  FROM topup_helpers
  WHERE id = NEW.helper_id;

  IF _helper_user_id IS NOT NULL AND NEW.sender_type = 'admin' THEN
    -- Insert into notifications (bypasses RLS via SECURITY DEFINER)
    INSERT INTO notifications (user_id, type, title, message, data, is_read)
    VALUES (
      _helper_user_id,
      'admin_message',
      '📢 ' || COALESCE(NEW.title, 'Admin Message'),
      COALESCE(NEW.message, ''),
      jsonb_build_object(
        'message_id', NEW.id,
        'priority', COALESCE(NEW.priority, 'normal'),
        'source', 'helper_messaging'
      ),
      false
    );

    -- Also insert into helper_notifications for the helper dashboard
    INSERT INTO helper_notifications (helper_id, type, title, message, data, is_read)
    VALUES (
      NEW.helper_id,
      'admin_message',
      '📢 ' || COALESCE(NEW.title, 'Admin Message'),
      COALESCE(NEW.message, ''),
      jsonb_build_object(
        'message_id', NEW.id,
        'priority', COALESCE(NEW.priority, 'normal')
      ),
      false
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_online_status(p_user_id uuid, p_is_online boolean, p_last_seen_at timestamptz DEFAULT now())
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN UPDATE profiles SET is_online=p_is_online, last_seen_at=p_last_seen_at WHERE id=p_user_id; END; $$;

CREATE OR REPLACE FUNCTION public.set_ticket_sender_sector()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.topup_helpers WHERE user_id = NEW.user_id) THEN
    NEW.sender_sector := 'helper';
  ELSIF EXISTS (SELECT 1 FROM public.agencies WHERE owner_id = NEW.user_id) THEN
    NEW.sender_sector := 'agency';
  ELSIF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.user_id AND is_host = true) THEN
    NEW.sender_sector := 'host';
  ELSE
    NEW.sender_sector := 'user';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_push_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_edge_url TEXT;
  v_service_key TEXT;
  v_payload JSONB;
BEGIN
  -- Skip admin-only types
  IF NEW.type IN ('verification', 'host_application', 'support', 'helper_application', 'helper_upgrade', 'helper_topup', 'new_agency', 'agency_withdrawal', 'admin_alert') THEN
    RETURN NEW;
  END IF;

  -- Build edge function URL
  v_edge_url := rtrim(current_setting('app.settings.supabase_url', true), '/') || '/functions/v1/push-on-notification';
  
  -- If app.settings not available, use direct URL
  IF v_edge_url IS NULL OR v_edge_url = '/functions/v1/push-on-notification' THEN
    v_edge_url := 'https://pppcwawjjpwwrmvezcdy.supabase.co/functions/v1/push-on-notification';
  END IF;

  v_service_key := current_setting('app.settings.service_role_key', true);
  
  -- If service key not available, use the anon key for invocation
  IF v_service_key IS NULL OR v_service_key = '' THEN
    v_service_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwcGN3YXdqanB3d3JtdmV6Y2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzQ4OTYsImV4cCI6MjA4MzkxMDg5Nn0.VUy58uiU63Kb3i4qj2ALK2s3arjBJ25CbnwCcvblpQw';
  END IF;

  v_payload := jsonb_build_object(
    'record', jsonb_build_object(
      'user_id', NEW.user_id,
      'title', NEW.title,
      'message', NEW.message,
      'type', NEW.type,
      'data', COALESCE(NEW.data, '{}'::jsonb)
    )
  );

  -- Fire and forget HTTP POST to edge function
  PERFORM extensions.http_post(
    url := v_edge_url,
    body := v_payload::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    )::jsonb
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't block notification insert if push fails
    RAISE WARNING 'Push notification trigger failed: %', SQLERRM;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_agency_commission_rate()
RETURNS TRIGGER AS $$
DECLARE
  tier_rate numeric;
BEGIN
  -- Look up the correct commission rate from agency_level_tiers
  SELECT commission_rate INTO tier_rate
  FROM public.agency_level_tiers
  WHERE level_code = NEW.level AND is_active = true
  LIMIT 1;

  IF tier_rate IS NOT NULL THEN
    NEW.commission_rate := tier_rate;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.notify_helper_on_new_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_name TEXT;
  v_currency_symbol TEXT;
  v_title TEXT;
  v_message TEXT;
  v_type TEXT;
BEGIN
  -- Get user display name
  SELECT display_name INTO v_user_name 
  FROM profiles WHERE id = NEW.user_id;
  
  -- Get currency symbol
  SELECT currency_symbol INTO v_currency_symbol
  FROM currency_rates WHERE currency_code = NEW.currency_code
  LIMIT 1;
  
  IF v_currency_symbol IS NULL THEN
    v_currency_symbol := '$';
  END IF;

  IF NEW.status = 'pending' THEN
    v_type := 'new_topup_order';
    v_title := '💎 New Top-up Order!';
    v_message := format('New order from %s: %s diamonds (%s%s)', 
      COALESCE(v_user_name, 'User'), 
      NEW.coin_amount, 
      v_currency_symbol,
      ROUND(NEW.amount_local::numeric, 2)
    );
  ELSIF NEW.status = 'completed' THEN
    v_type := 'order_completed';
    v_title := '💰 New Sale!';
    v_message := format('You sold %s diamonds. %s diamonds deducted from your wallet.', 
      NEW.coin_amount, NEW.coin_amount
    );
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO helper_notifications (
    helper_id, type, title, message, data, is_read
  ) VALUES (
    NEW.helper_id,
    v_type,
    v_title,
    v_message,
    jsonb_build_object(
      'order_id', NEW.id,
      'coins', NEW.coin_amount,
      'amount_local', NEW.amount_local,
      'amount_usd', NEW.amount_usd,
      'payment_method', NEW.payment_method,
      'user_id', NEW.user_id
    ),
    false
  );
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_balance_manipulation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If current_user differs from session_user, we're inside a SECURITY DEFINER function - allow
  IF current_user IS DISTINCT FROM session_user THEN
    RETURN NEW;
  END IF;

  -- Also allow service_role / postgres direct access
  IF current_setting('role', true) = 'service_role' OR
     current_setting('role', true) = 'postgres' OR
     current_user = 'postgres' OR
     current_user = 'supabase_admin' THEN
    RETURN NEW;
  END IF;

  -- Block direct balance changes from anon/authenticated roles
  IF OLD.coins IS DISTINCT FROM NEW.coins THEN
    RAISE EXCEPTION 'Direct coin balance modification is not allowed. Use authorized functions.';
  END IF;

  IF OLD.beans IS DISTINCT FROM NEW.beans THEN
    RAISE EXCEPTION 'Direct beans balance modification is not allowed. Use authorized functions.';
  END IF;

  IF OLD.total_earnings IS DISTINCT FROM NEW.total_earnings THEN
    RAISE EXCEPTION 'Direct earnings modification is not allowed. Use authorized functions.';
  END IF;

  IF OLD.total_consumption IS DISTINCT FROM NEW.total_consumption THEN
    RAISE EXCEPTION 'Direct consumption modification is not allowed. Use authorized functions.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.helper_transfer_diamonds_to_self(
  _user_id UUID,
  _amount INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _helper_record RECORD;
  _current_coins INTEGER;
  _new_wallet_balance INTEGER;
  _new_coins INTEGER;
BEGIN
  -- Validate amount
  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Amount must be greater than 0');
  END IF;

  -- Lock and fetch helper record
  SELECT id, user_id, wallet_balance, is_active
  INTO _helper_record
  FROM topup_helpers
  WHERE user_id = _user_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'No active trader/helper account found');
  END IF;

  -- Check sufficient balance in trader wallet
  IF _helper_record.wallet_balance < _amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient trader wallet balance. Available: ' || _helper_record.wallet_balance);
  END IF;

  -- Lock and fetch user profile
  SELECT coins INTO _current_coins
  FROM profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User profile not found');
  END IF;

  -- Calculate new balances
  _new_wallet_balance := _helper_record.wallet_balance - _amount;
  _new_coins := _current_coins + _amount;

  -- Deduct from trader wallet
  UPDATE topup_helpers
  SET wallet_balance = _new_wallet_balance, updated_at = NOW()
  WHERE id = _helper_record.id;

  -- Add to profile coins (My Diamond Balance)
  UPDATE profiles
  SET coins = _new_coins
  WHERE id = _user_id;

  -- Log the transfer in coin_transfers
  INSERT INTO coin_transfers (sender_id, receiver_id, amount, sender_type, status, note)
  VALUES (_user_id, _user_id, _amount, 'trader_self_recharge', 'completed', 'Self recharge from Trader Wallet to My Diamond Balance');

  RETURN json_build_object(
    'success', true,
    'amount', _amount,
    'new_wallet_balance', _new_wallet_balance,
    'new_coins', _new_coins,
    'previous_wallet_balance', _helper_record.wallet_balance,
    'previous_coins', _current_coins
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_agency_host_compliance()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency RECORD;
  v_active_host_count INTEGER;
  v_has_payroll BOOLEAN;
BEGIN
  FOR v_agency IN
    SELECT a.id, a.name, a.agency_code, a.owner_id
    FROM agencies a
    WHERE a.is_active = true
      AND a.created_at <= (now() - INTERVAL '7 days')
  LOOP
    -- Check if agency owner has payroll enabled
    SELECT EXISTS(
      SELECT 1 FROM topup_helpers th
      WHERE th.user_id = v_agency.owner_id
        AND th.is_verified = true
        AND th.payroll_enabled = true
    ) INTO v_has_payroll;

    -- Skip payroll-enabled agencies
    IF v_has_payroll THEN
      CONTINUE;
    END IF;

    -- Count active hosts for this agency
    SELECT count(*) INTO v_active_host_count
    FROM agency_hosts ah
    WHERE ah.agency_id = v_agency.id
      AND ah.status = 'active';

    -- If less than 10 active hosts, deactivate the agency
    IF v_active_host_count < 10 THEN
      UPDATE agencies
      SET is_active = false,
          is_blocked = true,
          blocked_reason = 'Auto-deactivated: Failed to recruit 10 active hosts within 7 days (had ' || v_active_host_count || ')',
          blocked_at = now(),
          updated_at = now()
      WHERE id = v_agency.id;

      RAISE NOTICE 'Agency % (%) deactivated: only % active hosts', v_agency.name, v_agency.agency_code, v_active_host_count;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_host_total_earnings(p_host_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET total_earnings = 0,
      updated_at = now()
  WHERE id = p_host_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.debug_distribute_test(p_category TEXT, p_period_type TEXT)
RETURNS TABLE(step TEXT, detail TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date TIMESTAMPTZ;
  v_end_date TIMESTAMPTZ;
  v_period_label TEXT;
  v_count INTEGER := 0;
  v_already BOOLEAN;
BEGIN
  IF p_period_type = 'daily' THEN
    v_end_date := date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    v_start_date := v_end_date - interval '1 day';
    v_period_label := 'daily_' || to_char(v_start_date, 'YYYY-MM-DD');
  ELSIF p_period_type = 'weekly' THEN
    v_end_date := date_trunc('week', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
    v_start_date := v_end_date - interval '1 week';
    v_period_label := 'weekly_' || to_char(v_start_date, 'YYYY-MM-DD');
  END IF;

  step := 'dates'; detail := v_start_date::text || ' -> ' || v_end_date::text || ' label=' || v_period_label;
  RETURN NEXT;

  SELECT EXISTS (
    SELECT 1 FROM leaderboard_reward_history
    WHERE category = p_category AND period_type = p_period_type AND period_label = v_period_label
    LIMIT 1
  ) INTO v_already;
  step := 'idempotency'; detail := v_already::text;
  RETURN NEXT;

  IF p_category = 'host_earnings' THEN
    SELECT COUNT(*) INTO v_count FROM (
      WITH gift_stats AS (
        SELECT gt.receiver_id AS user_id, SUM(FLOOR(gt.coin_amount * 0.6)) AS total
        FROM gift_transactions gt
        INNER JOIN profiles p ON p.id = gt.receiver_id AND p.is_host = true
        WHERE gt.created_at >= v_start_date AND gt.created_at < v_end_date
        GROUP BY gt.receiver_id
      ),
      call_stats AS (
        SELECT pc.host_id AS user_id, SUM(pc.host_earnings_amount) AS total
        FROM private_calls pc
        INNER JOIN profiles p ON p.id = pc.host_id AND p.is_host = true
        WHERE pc.created_at >= v_start_date AND pc.created_at < v_end_date AND pc.status = 'completed'
        GROUP BY pc.host_id
      ),
      combined AS (
        SELECT COALESCE(g.user_id, c.user_id) AS user_id,
               COALESCE(g.total, 0) + COALESCE(c.total, 0) AS stat_value
        FROM gift_stats g FULL OUTER JOIN call_stats c ON g.user_id = c.user_id
      )
      SELECT user_id, stat_value FROM combined
      WHERE user_id IS NOT NULL AND stat_value > 0
      AND user_id NOT IN ('6888e618-ae45-4bbb-bbd2-6834fc0f9ff9','ab155d31-96d4-4a42-855d-b2c090ba0339','251cbe57-e46b-41c0-bfb5-4cfcad9d6499')
      ORDER BY stat_value DESC LIMIT 50
    ) sub;
    step := 'host_earnings_count'; detail := v_count::text;
    RETURN NEXT;
  END IF;

  -- Check reward config
  SELECT COUNT(*) INTO v_count FROM leaderboard_reward_config 
  WHERE category = p_category AND period_type = p_period_type AND is_active = true;
  step := 'reward_config_count'; detail := v_count::text;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_rating_reward(p_claim_id uuid, p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_profile RECORD;
  v_reward_type TEXT;
  v_reward_amount INT;
BEGIN
  -- Get claim
  SELECT * INTO v_claim FROM rating_reward_claims WHERE id = p_claim_id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim not found or already processed');
  END IF;

  -- Get user profile to determine host status
  SELECT id, is_host, display_name INTO v_profile FROM profiles WHERE id = v_claim.user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Determine reward: Host = 10,000 Beans, User = 5,000 Diamonds
  IF COALESCE(v_profile.is_host, false) THEN
    v_reward_type := 'beans';
    v_reward_amount := 10000;
    UPDATE profiles SET beans_balance = COALESCE(beans_balance, 0) + 10000 WHERE id = v_claim.user_id;
  ELSE
    v_reward_type := 'diamonds';
    v_reward_amount := 5000;
    UPDATE profiles SET diamonds = COALESCE(diamonds, 0) + 5000 WHERE id = v_claim.user_id;
  END IF;

  -- Update claim record
  UPDATE rating_reward_claims 
  SET status = 'approved', 
      reward_type = v_reward_type, 
      reward_amount = v_reward_amount,
      reviewed_by = p_admin_id, 
      reviewed_at = now() 
  WHERE id = p_claim_id;

  -- Send notification
  INSERT INTO notifications (user_id, type, title, message, data)
  VALUES (
    v_claim.user_id,
    'reward',
    '🎉 Rating Reward Approved!',
    CASE WHEN v_reward_type = 'beans' 
      THEN 'You received 10,000 Beans for your 5-star rating!'
      ELSE 'You received 5,000 Diamonds for your 5-star rating!'
    END,
    jsonb_build_object('reward_type', v_reward_type, 'amount', v_reward_amount)
  );

  RETURN jsonb_build_object('success', true, 'reward_type', v_reward_type, 'amount', v_reward_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_permanent_ban()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_blocked = true AND (OLD.is_blocked IS NOT TRUE) THEN
    NEW.is_host := false;
    NEW.host_status := 'rejected';
    NEW.is_online := false;
    NEW.is_in_call := false;
    NEW.active_session_id := null;

    UPDATE public.agency_hosts
    SET status = 'removed', left_at = now()
    WHERE host_id = NEW.id AND status = 'active';

    UPDATE public.agencies
    SET is_blocked = true,
        is_active = false,
        blocked_at = now(),
        blocked_reason = 'Owner permanently banned'
    WHERE owner_id = NEW.id AND is_blocked IS NOT TRUE;

    DELETE FROM public.followers
    WHERE follower_id = NEW.id OR following_id = NEW.id;

    UPDATE public.live_streams
    SET is_active = false,
        ended_at = now()
    WHERE host_id = NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

-- B) Strong duplicate face lookup (all users)
DROP FUNCTION IF EXISTS public.find_account_by_face(text);
CREATE FUNCTION public.find_account_by_face(face_hash_param text)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  app_uid text,
  is_deleted boolean,
  deletion_scheduled_at timestamptz,
  is_blocked boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, p.app_uid, p.is_deleted, p.deletion_scheduled_at, p.is_blocked
  FROM public.profiles p
  WHERE p.face_hash = face_hash_param
  ORDER BY p.created_at ASC
  LIMIT 1;

CREATE OR REPLACE FUNCTION public.check_ban_on_login(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked boolean;
  v_reason text;
  v_device_id text;
BEGIN
  SELECT is_blocked, blocked_reason, device_id
  INTO v_blocked, v_reason, v_device_id
  FROM profiles WHERE id = p_user_id;
  
  IF v_blocked = true THEN
    RETURN jsonb_build_object('banned', true, 'reason', COALESCE(v_reason, 'Account permanently banned'));
  END IF;
  
  IF v_device_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM banned_devices WHERE device_id = v_device_id AND is_permanent = true) THEN
      UPDATE profiles SET is_blocked = true, blocked_reason = 'Device permanently banned' WHERE id = p_user_id;
      RETURN jsonb_build_object('banned', true, 'reason', 'Device permanently banned');
    END IF;
  END IF;
  
  RETURN jsonb_build_object('banned', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ban_duplicate_face_attempt(
  _user_id uuid,
  _duplicate_user_id uuid,
  _duplicate_uid text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_id text;
  v_reason text;
  v_user_name text;
  v_user_uid text;
  v_dup_name text;
BEGIN
  IF auth.uid() IS DISTINCT FROM _user_id THEN
    RAISE EXCEPTION 'Unauthorized duplicate-face ban attempt';
  END IF;

  v_reason := format(
    'Permanent ban: duplicate face detected. Matched existing account %s',
    COALESCE(_duplicate_uid, _duplicate_user_id::text)
  );

  -- Get user details for admin notice
  SELECT display_name, app_uid, device_id INTO v_user_name, v_user_uid, v_device_id
  FROM public.profiles WHERE id = _user_id;

  SELECT display_name INTO v_dup_name
  FROM public.profiles WHERE id = _duplicate_user_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET is_blocked = true,
      blocked_reason = v_reason,
      blocked_at = now()
  WHERE id = _user_id
    AND is_blocked IS NOT TRUE;

  INSERT INTO public.live_bans (user_id, ban_reason, violation_type, ban_duration_hours, ban_end, is_active, auto_banned)
  SELECT _user_id, v_reason, 'duplicate_face', NULL, NULL, true, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.live_bans
    WHERE user_id = _user_id AND is_active = true AND ban_end IS NULL AND ban_duration_hours IS NULL
  );

  IF v_device_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.banned_devices WHERE device_id = v_device_id AND is_permanent = true
  ) THEN
    INSERT INTO public.banned_devices (user_id, device_id, reason, is_permanent, banned_at)
    VALUES (_user_id, v_device_id, v_reason, true, now());
  END IF;

  -- Create admin notice for duplicate face detection
  INSERT INTO public.admin_notices (
    title, message, priority, target_audience, is_active
  ) VALUES (
    '🚨 Duplicate Face Detected & Banned',
    format(
      'User: %s (UID: %s)%sMatched Account: %s (UID: %s)%sDevice ID: %s%sAction: Auto-banned permanently',
      COALESCE(v_user_name, 'Unknown'), COALESCE(v_user_uid, _user_id::text),
      E'\\\
',
      COALESCE(v_dup_name, 'Unknown'), COALESCE(_duplicate_uid, _duplicate_user_id::text),
      E'\\\
',
      COALESCE(v_device_id, 'N/A'),
      E'\\\
'
    ),
    'urgent',
    ARRAY['owner', 'admin'],
    true
  );

  RETURN jsonb_build_object('success', true, 'reason', v_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_permanent_live_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_device_id text;
BEGIN
  IF NEW.is_active = true AND NEW.ban_end IS NULL AND NEW.ban_duration_hours IS NULL THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);

    UPDATE public.profiles
    SET is_blocked = true,
        blocked_reason = COALESCE(NEW.ban_reason, 'Permanent ban by admin'),
        blocked_at = COALESCE(blocked_at, now())
    WHERE id = NEW.user_id
      AND is_blocked IS NOT TRUE;

    SELECT device_id INTO v_device_id FROM public.profiles WHERE id = NEW.user_id;
    IF v_device_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.banned_devices WHERE device_id = v_device_id AND is_permanent = true
    ) THEN
      INSERT INTO public.banned_devices (user_id, device_id, reason, is_permanent, banned_at)
      VALUES (NEW.user_id, v_device_id, COALESCE(NEW.ban_reason, 'Permanent ban by admin'), true, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_effective_host_percent()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setting jsonb;
  v_host numeric;
BEGIN
  SELECT setting_value INTO v_setting FROM app_settings WHERE setting_key = 'gift_commission' ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  IF v_setting IS NOT NULL AND jsonb_typeof(v_setting) = 'object' THEN
    v_host := NULLIF(v_setting->>'host_percent', '')::numeric;
    IF v_host IS NULL AND (v_setting ? 'company_percent') THEN
      v_host := 100 - NULLIF(v_setting->>'company_percent', '')::numeric;
    END IF;
  END IF;
  IF v_host IS NULL THEN
    SELECT setting_value INTO v_setting FROM app_settings WHERE setting_key = 'host_percent' ORDER BY updated_at DESC NULLS LAST LIMIT 1;
    IF v_setting IS NOT NULL THEN
      IF jsonb_typeof(v_setting) = 'number' THEN v_host := (v_setting::text)::numeric;
      ELSIF jsonb_typeof(v_setting) = 'object' THEN v_host := NULLIF(COALESCE(v_setting->>'host_percent', v_setting->>'hostPercent'), '')::numeric;
      END IF;
    END IF;
  END IF;
  RETURN LEAST(100, GREATEST(0, COALESCE(v_host, 50)))::integer;
EXCEPTION WHEN OTHERS THEN RETURN 50;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_call_host_commission_percent()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_setting jsonb;
  v_host numeric;
BEGIN
  SELECT setting_value INTO v_setting FROM app_settings WHERE setting_key = 'call_rates' ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  IF v_setting IS NOT NULL AND jsonb_typeof(v_setting) = 'object' THEN
    v_host := NULLIF(v_setting->>'host_commission_percent', '')::numeric;
    IF v_host IS NULL AND (v_setting ? 'company_percent') THEN
      v_host := 100 - NULLIF(v_setting->>'company_percent', '')::numeric;
    END IF;
  END IF;
  IF v_host IS NULL THEN
    SELECT setting_value INTO v_setting FROM app_settings WHERE setting_key = 'call_pricing' ORDER BY updated_at DESC NULLS LAST LIMIT 1;
    IF v_setting IS NOT NULL AND jsonb_typeof(v_setting) = 'object' THEN
      v_host := NULLIF(v_setting->>'host_commission_percent', '')::numeric;
      IF v_host IS NULL AND (v_setting ? 'company_commission_percent') THEN
        v_host := 100 - NULLIF(v_setting->>'company_commission_percent', '')::numeric;
      END IF;
    END IF;
  END IF;
  IF v_host IS NULL THEN RETURN public.get_effective_host_percent(); END IF;
  RETURN LEAST(100, GREATEST(0, v_host))::integer;
EXCEPTION WHEN OTHERS THEN RETURN public.get_effective_host_percent();
END;
$$;

CREATE OR REPLACE FUNCTION public.check_otp_rate_limit(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM public.email_otps
  WHERE email = p_email
    AND created_at > now() - interval '10 minutes';
  
  RETURN recent_count < 5;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_finalize_face_verification(
  _submission_id uuid,
  _detected_gender text,
  _admin_notes text DEFAULT NULL,
  _avatar_url text DEFAULT NULL,
  _display_name text DEFAULT NULL,
  _host_photos text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_submission public.face_verification_submissions%ROWTYPE;
  v_existing_gender text;
  v_gender text;
  v_is_host boolean;
  v_verification_type text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_submission
  FROM public.face_verification_submissions
  WHERE id = _submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Submission not found';
  END IF;

  -- Get existing profile gender for safeguard check
  SELECT gender INTO v_existing_gender
  FROM public.profiles
  WHERE id = v_submission.user_id;

  v_gender := CASE WHEN lower(coalesce(_detected_gender, 'male')) = 'female' THEN 'female' ELSE 'male' END;
  
  -- CRITICAL SAFEGUARD: If existing profile gender is 'male', NEVER convert to host
  -- regardless of what _detected_gender says
  IF lower(coalesce(v_existing_gender, '')) = 'male' AND v_gender = 'female' THEN
    v_gender := 'male';
  END IF;
  
  v_is_host := (v_gender = 'female');
  v_verification_type := CASE WHEN v_is_host THEN 'host' ELSE 'face' END;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.face_verification_submissions
  SET status = 'approved',
      verification_type = v_verification_type,
      rejection_reason = NULL,
      admin_notes = COALESCE(_admin_notes, admin_notes),
      reviewed_at = now(),
      face_verified_at = now(),
      updated_at = now()
  WHERE id = _submission_id;

  UPDATE public.profiles
  SET is_verified = true,
      is_face_verified = true,
      face_verification_image = v_submission.face_image_url,
      face_verified_at = now(),
      gender = v_gender,
      is_host = v_is_host,
      host_status = CASE WHEN v_is_host THEN 'approved' ELSE NULL END,
      avatar_url = COALESCE(_avatar_url, avatar_url),
      display_name = COALESCE(NULLIF(trim(_display_name), ''), display_name),
      updated_at = now()
  WHERE id = v_submission.user_id;

  RETURN jsonb_build_object(
    'success', true,
    'submission_id', _submission_id,
    'user_id', v_submission.user_id,
    'gender', v_gender,
    'is_host', v_is_host,
    'verification_type', v_verification_type
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.service_add_beans(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  -- Set bypass flag for the trigger
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  
  UPDATE profiles
  SET beans = COALESCE(beans, 0) + p_amount
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  -- Reset bypass flag
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.service_add_diamonds(p_user_id uuid, p_amount integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  
  UPDATE profiles
  SET coins = COALESCE(coins, 0) + p_amount
  WHERE id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.retroactive_leaderboard_credit()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  credited_count integer := 0;
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  
  FOR r IN 
    SELECT user_id, SUM(reward_beans)::integer as total_beans, SUM(reward_diamonds)::integer as total_diamonds
    FROM leaderboard_reward_history
    WHERE (reward_beans > 0 OR reward_diamonds > 0)
    GROUP BY user_id
  LOOP
    IF r.total_beans > 0 THEN
      UPDATE profiles SET beans = COALESCE(beans, 0) + r.total_beans WHERE id = r.user_id;
    END IF;
    IF r.total_diamonds > 0 THEN
      UPDATE profiles SET coins = COALESCE(coins, 0) + r.total_diamonds WHERE id = r.user_id;
    END IF;
    credited_count := credited_count + 1;
  END LOOP;
  
  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  RETURN credited_count || ' users credited';
END;
$$;

CREATE OR REPLACE FUNCTION public.create_agency_for_user(
  _owner_id uuid,
  _name text,
  _agency_code text,
  _level text DEFAULT 'A1'::text,
  _commission_rate numeric DEFAULT 3,
  _email text DEFAULT NULL::text,
  _whatsapp text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_agency_id uuid;
  v_existing_agency_id uuid;
  v_normalized_code text;
BEGIN
  v_normalized_code := upper(trim(_agency_code));

  -- Authentication check
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be logged in to create an agency.');
  END IF;

  -- Validate agency name
  IF _name IS NULL OR char_length(trim(_name)) < 2 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency name must be at least 2 characters long.');
  END IF;

  -- Validate agency code
  IF v_normalized_code IS NULL OR char_length(v_normalized_code) < 4 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agency code must be at least 4 characters long.');
  END IF;

  -- Check if user already owns an agency
  SELECT id INTO v_existing_agency_id
  FROM agencies
  WHERE owner_id = _owner_id
  LIMIT 1;

  IF v_existing_agency_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already own an agency. Each user can only create one agency.');
  END IF;

  -- Check if user is currently a host in another agency
  IF EXISTS (SELECT 1 FROM agency_hosts WHERE host_id = _owner_id AND status = 'active') THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are currently an active host in another agency. Please leave that agency first.');
  END IF;

  -- Check if user has a pending join request
  IF EXISTS (SELECT 1 FROM agency_hosts WHERE host_id = _owner_id AND status = 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'You have a pending join request at another agency. Please cancel it first.');
  END IF;

  -- Check duplicate agency code
  SELECT id INTO v_existing_agency_id
  FROM agencies
  WHERE upper(trim(agency_code)) = v_normalized_code
  LIMIT 1;

  IF v_existing_agency_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'This agency code is already taken. Please choose a different code.');
  END IF;

  -- Create the agency
  INSERT INTO agencies (name, agency_code, owner_id, level, commission_rate, wallet_balance, total_hosts, total_agents, is_active, email, whatsapp_number)
  VALUES (trim(_name), v_normalized_code, _owner_id, _level, _commission_rate, 0, 0, 0, true, _email, _whatsapp)
  RETURNING id INTO v_agency_id;

  -- Update profile with agency info
  UPDATE profiles
  SET is_agency_owner = true, agency_id = v_agency_id
  WHERE id = _owner_id;

  RETURN jsonb_build_object(
    'success', true,
    'agency_id', v_agency_id,
    'agency_code', v_normalized_code
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fix_excess_weekly_rewards()
RETURNS TABLE(user_id uuid, category text, excess_beans bigint, excess_diamonds bigint, records_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_total_beans bigint := 0;
  v_total_diamonds bigint := 0;
  v_total_deleted bigint := 0;
BEGIN
  -- For each user+category combo with duplicate weekly rewards,
  -- keep the FIRST one (earliest sent_at), deduct and delete the rest
  FOR v_rec IN
    WITH ranked AS (
      SELECT h.id, h.user_id, h.category, h.reward_beans, h.reward_diamonds,
        ROW_NUMBER() OVER (PARTITION BY h.user_id, h.category ORDER BY h.sent_at ASC) as rn
      FROM leaderboard_reward_history h
      WHERE h.period_type = 'weekly'
    ),
    excess_per_user AS (
      SELECT r.user_id, r.category,
        SUM(r.reward_beans) as sum_beans,
        SUM(r.reward_diamonds) as sum_diamonds,
        array_agg(r.id) as ids_to_delete,
        COUNT(*) as cnt
      FROM ranked r
      WHERE r.rn > 1
      GROUP BY r.user_id, r.category
    )
    SELECT * FROM excess_per_user
  LOOP
    -- Deduct excess beans
    IF v_rec.sum_beans > 0 THEN
      UPDATE profiles p
      SET beans = GREATEST(0, COALESCE(p.beans, 0) - v_rec.sum_beans)
      WHERE p.id = v_rec.user_id;
      v_total_beans := v_total_beans + v_rec.sum_beans;
    END IF;
    
    -- Deduct excess diamonds
    IF v_rec.sum_diamonds > 0 THEN
      UPDATE profiles p
      SET coins = GREATEST(0, COALESCE(p.coins, 0) - v_rec.sum_diamonds)
      WHERE p.id = v_rec.user_id;
      v_total_diamonds := v_total_diamonds + v_rec.sum_diamonds;
    END IF;
    
    -- Delete excess reward history records
    DELETE FROM leaderboard_reward_history h
    WHERE h.id = ANY(v_rec.ids_to_delete);
    
    v_total_deleted := v_total_deleted + v_rec.cnt;
    
    user_id := v_rec.user_id;
    category := v_rec.category;
    excess_beans := v_rec.sum_beans;
    excess_diamonds := v_rec.sum_diamonds;
    records_deleted := v_rec.cnt;
    RETURN NEXT;
  END LOOP;
  
  -- Also delete excess weekly notifications
  DELETE FROM notifications n
  WHERE n.type = 'leaderboard_reward'
    AND n.data->>'period_type' = 'weekly'
    AND n.created_at >= '2026-03-02'
    AND n.id NOT IN (
      SELECT DISTINCT ON (n2.user_id, n2.data->>'category') n2.id
      FROM notifications n2
      WHERE n2.type = 'leaderboard_reward'
        AND n2.data->>'period_type' = 'weekly'
        AND n2.created_at >= '2026-03-02'
      ORDER BY n2.user_id, n2.data->>'category', n2.created_at ASC
    );
  
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_user_on_admin_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket_user_id uuid;
  _ticket_number text;
  _ticket_category text;
  _action_url text;
BEGIN
  IF NEW.sender_type <> 'admin' THEN
    RETURN NEW;
  END IF;

  SELECT user_id, ticket_number, category
  INTO _ticket_user_id, _ticket_number, _ticket_category
  FROM public.support_tickets
  WHERE id = NEW.ticket_id;

  IF _ticket_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF _ticket_category = 'live_chat' THEN
    _action_url := '/settings/customer-service?mode=live_chat&ticket_id=' || NEW.ticket_id::text || '&message_id=' || NEW.id::text;
  ELSE
    _action_url := '/settings/customer-service';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    _ticket_user_id,
    'support_reply',
    'Support Reply',
    LEFT(NEW.content, 100),
    jsonb_build_object(
      'ticket_id', NEW.ticket_id,
      'message_id', NEW.id,
      'action_url', _action_url
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_agency_request(_host_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM agency_hosts
  WHERE host_id = _host_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_balance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coins bigint;
  v_beans bigint;
  v_diamonds bigint;
BEGIN
  SELECT 
    COALESCE(coins, 0),
    COALESCE(beans, 0),
    COALESCE(diamonds, 0)
  INTO v_coins, v_beans, v_diamonds
  FROM profiles
  WHERE id = auth.uid();

  RETURN jsonb_build_object(
    'coins', v_coins,
    'beans', v_beans,
    'diamonds', v_diamonds
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_message_read_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.is_read = true AND OLD.is_read = false THEN
    NEW.status := 'read';
    NEW.read_at := COALESCE(NEW.read_at, now());
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_messages_delivered(
  p_conversation_id uuid,
  p_recipient_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_count integer;
BEGIN
  UPDATE public.messages
  SET 
    status = 'delivered',
    delivered_at = now()
  WHERE 
    conversation_id = p_conversation_id
    AND sender_id != p_recipient_id
    AND status = 'sent';
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_messages_read_batch(
  p_conversation_id uuid,
  p_recipient_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_count integer;
BEGIN
  UPDATE public.messages
  SET 
    status = 'read',
    is_read = true,
    read_at = now(),
    delivered_at = COALESCE(delivered_at, now())
  WHERE 
    conversation_id = p_conversation_id
    AND sender_id != p_recipient_id
    AND status IN ('sent', 'delivered');
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_analytics_chart_data(p_days integer DEFAULT 7)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date date := CURRENT_DATE - p_days;
  v_result json;
BEGIN
  SELECT json_build_object(
    'user_growth', (
      SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.date), '[]'::json)
      FROM (
        SELECT 
          d::date AS date,
          COALESCE((SELECT count(*) FROM profiles WHERE created_at::date = d::date), 0) AS new_users,
          COALESCE((SELECT count(*) FROM profiles WHERE created_at::date = d::date AND is_host = true), 0) AS new_hosts,
          COALESCE((SELECT count(*) FROM profiles WHERE created_at::date <= d::date), 0) AS total_users
        FROM generate_series(v_start_date, CURRENT_DATE, '1 day'::interval) d
      ) t
    ),
    'gift_revenue', (
      SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.date), '[]'::json)
      FROM (
        SELECT 
          d::date AS date,
          COALESCE((SELECT sum(coin_amount) FROM gift_transactions WHERE created_at::date = d::date), 0) AS coins,
          COALESCE((SELECT count(*) FROM gift_transactions WHERE created_at::date = d::date), 0) AS transactions
        FROM generate_series(v_start_date, CURRENT_DATE, '1 day'::interval) d
      ) t
    ),
    'call_activity', (
      SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.date), '[]'::json)
      FROM (
        SELECT 
          d::date AS date,
          COALESCE((SELECT count(*) FROM private_calls WHERE created_at::date = d::date), 0) AS calls,
          COALESCE((SELECT sum(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - created_at)) / 60) FROM private_calls WHERE created_at::date = d::date AND status = 'completed'), 0)::integer AS total_minutes
        FROM generate_series(v_start_date, CURRENT_DATE, '1 day'::interval) d
      ) t
    ),
    'recharge_revenue', (
      SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.date), '[]'::json)
      FROM (
        SELECT 
          d::date AS date,
          COALESCE((SELECT sum(amount) FROM recharge_transactions WHERE created_at::date = d::date AND status = 'completed'), 0) AS revenue,
          COALESCE((SELECT count(*) FROM recharge_transactions WHERE created_at::date = d::date AND status = 'completed'), 0) AS count
        FROM generate_series(v_start_date, CURRENT_DATE, '1 day'::interval) d
      ) t
    ),
    'agency_distribution', (
      SELECT json_build_object(
        'active', (SELECT count(*) FROM agencies WHERE is_active = true AND is_blocked = false),
        'inactive', (SELECT count(*) FROM agencies WHERE is_active = false AND is_blocked = false),
        'blocked', (SELECT count(*) FROM agencies WHERE is_blocked = true)
      )
    ),
    'summary', json_build_object(
      'total_revenue_period', COALESCE((SELECT sum(amount) FROM recharge_transactions WHERE created_at::date >= v_start_date AND status = 'completed'), 0),
      'total_gifts_period', COALESCE((SELECT sum(coin_amount) FROM gift_transactions WHERE created_at::date >= v_start_date), 0),
      'total_calls_period', (SELECT count(*) FROM private_calls WHERE created_at::date >= v_start_date),
      'total_new_users_period', (SELECT count(*) FROM profiles WHERE created_at::date >= v_start_date),
      'total_new_hosts_period', (SELECT count(*) FROM profiles WHERE created_at::date >= v_start_date AND is_host = true)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.safe_credit_diamonds(
  p_user_id uuid,
  p_amount integer,
  p_gateway text,
  p_order_id text,
  p_transaction_id text DEFAULT NULL,
  p_amount_usd numeric DEFAULT 0,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_before integer;
  v_balance_after integer;
  v_existing_count integer;
BEGIN
  -- STEP 1: Idempotency check — prevent double-crediting
  IF p_order_id IS NOT NULL AND p_order_id != '' THEN
    SELECT count(*) INTO v_existing_count
    FROM payment_reconciliation_log
    WHERE order_id = p_order_id
      AND event_type = 'credit_success'
      AND gateway = p_gateway;
    
    IF v_existing_count > 0 THEN
      INSERT INTO payment_reconciliation_log (event_type, gateway, user_id, order_id, transaction_id, amount_coins, metadata)
      VALUES ('duplicate_blocked', p_gateway, p_user_id, p_order_id, p_transaction_id, p_amount, 
              jsonb_build_object('reason', 'Already credited for this order'));
      
      RETURN jsonb_build_object('success', false, 'error', 'duplicate', 'message', 'Already processed');
    END IF;
  END IF;

  -- STEP 2: Get current balance
  SELECT COALESCE(coins, 0) INTO v_balance_before FROM profiles WHERE id = p_user_id;
  
  IF v_balance_before IS NULL THEN
    INSERT INTO payment_reconciliation_log (event_type, gateway, user_id, order_id, amount_coins, metadata)
    VALUES ('credit_failed', p_gateway, p_user_id, p_order_id, p_amount, 
            jsonb_build_object('reason', 'User not found'));
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;

  -- STEP 3: Credit diamonds (bypass protection trigger)
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  
  UPDATE profiles 
  SET coins = coins + p_amount, updated_at = now()
  WHERE id = p_user_id;
  
  -- STEP 4: Verify the credit
  SELECT COALESCE(coins, 0) INTO v_balance_after FROM profiles WHERE id = p_user_id;
  
  -- STEP 5: Reconciliation check
  IF v_balance_after != v_balance_before + p_amount THEN
    INSERT INTO payment_reconciliation_log (event_type, gateway, user_id, order_id, transaction_id, amount_coins, amount_usd, balance_before, balance_after, metadata)
    VALUES ('reconciliation_mismatch', p_gateway, p_user_id, p_order_id, p_transaction_id, p_amount, p_amount_usd, v_balance_before, v_balance_after,
            jsonb_build_object('expected_after', v_balance_before + p_amount, 'actual_after', v_balance_after));
    
    RETURN jsonb_build_object('success', false, 'error', 'balance_mismatch', 'balance_before', v_balance_before, 'balance_after', v_balance_after);
  END IF;

  -- STEP 6: Log success
  INSERT INTO payment_reconciliation_log (event_type, gateway, user_id, order_id, transaction_id, amount_coins, amount_usd, balance_before, balance_after, metadata)
  VALUES ('credit_success', p_gateway, p_user_id, p_order_id, p_transaction_id, p_amount, p_amount_usd, v_balance_before, v_balance_after, p_metadata);

  RETURN jsonb_build_object('success', true, 'balance_before', v_balance_before, 'balance_after', v_balance_after, 'credited', p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_payment_reconciliation_report(p_days integer DEFAULT 7)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_date timestamptz := now() - (p_days || ' days')::interval;
  v_result json;
BEGIN
  SELECT json_build_object(
    'total_credits', (SELECT count(*) FROM payment_reconciliation_log WHERE event_type = 'credit_success' AND created_at >= v_start_date),
    'total_coins_credited', COALESCE((SELECT sum(amount_coins) FROM payment_reconciliation_log WHERE event_type = 'credit_success' AND created_at >= v_start_date), 0),
    'total_usd', COALESCE((SELECT sum(amount_usd) FROM payment_reconciliation_log WHERE event_type = 'credit_success' AND created_at >= v_start_date), 0),
    'duplicates_blocked', (SELECT count(*) FROM payment_reconciliation_log WHERE event_type = 'duplicate_blocked' AND created_at >= v_start_date),
    'failures', (SELECT count(*) FROM payment_reconciliation_log WHERE event_type = 'credit_failed' AND created_at >= v_start_date),
    'mismatches', (SELECT count(*) FROM payment_reconciliation_log WHERE event_type = 'reconciliation_mismatch' AND created_at >= v_start_date),
    'by_gateway', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT gateway, 
               count(*) FILTER (WHERE event_type = 'credit_success') AS success_count,
               COALESCE(sum(amount_coins) FILTER (WHERE event_type = 'credit_success'), 0) AS total_coins,
               COALESCE(sum(amount_usd) FILTER (WHERE event_type = 'credit_success'), 0) AS total_usd,
               count(*) FILTER (WHERE event_type = 'duplicate_blocked') AS duplicates
        FROM payment_reconciliation_log
        WHERE created_at >= v_start_date
        GROUP BY gateway
      ) t
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_new_follower()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_name TEXT; v_avatar TEXT;
BEGIN
  SELECT display_name, avatar_url INTO v_name, v_avatar FROM profiles WHERE id = NEW.follower_id;
  v_name := COALESCE(v_name, 'Someone');
  INSERT INTO notifications (user_id, type, title, message, data, is_read)
  VALUES (NEW.following_id, 'new_follower', '👤 New Follower!', v_name || ' started following you',
    jsonb_build_object('follower_id', NEW.follower_id, 'follower_name', v_name, 'avatar_url', COALESCE(v_avatar, '')), false);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notify_on_new_follower: %', SQLERRM; RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_on_gift_received()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_sender TEXT; v_gift TEXT;
BEGIN
  SELECT display_name INTO v_sender FROM profiles WHERE id = NEW.sender_id;
  SELECT name INTO v_gift FROM gifts WHERE id = NEW.gift_id;
  v_sender := COALESCE(v_sender, 'Someone'); v_gift := COALESCE(v_gift, 'a gift');
  INSERT INTO notifications (user_id, type, title, message, data, is_read)
  VALUES (NEW.receiver_id, 'gift_received', '🎁 ' || v_sender || ' sent you a gift!', v_gift || ' (' || NEW.coin_amount || ' coins)',
    jsonb_build_object('sender_id', NEW.sender_id, 'sender_name', v_sender, 'gift_name', v_gift, 'coin_amount', NEW.coin_amount, 'gift_id', NEW.gift_id, 'quantity', COALESCE(NEW.quantity, 1)), false);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notify_on_gift_received: %', SQLERRM; RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_on_host_application_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status = 'approved' THEN
    INSERT INTO notifications (user_id, type, title, message, data, is_read)
    VALUES (NEW.user_id, 'host_approved', '🎉 Host Application Approved!', 'Your host application has been approved. Start live streaming now!',
      jsonb_build_object('status', 'approved', 'application_id', NEW.id), false);
  ELSIF NEW.status = 'rejected' THEN
    INSERT INTO notifications (user_id, type, title, message, data, is_read)
    VALUES (NEW.user_id, 'host_rejected', '❌ Host Application Rejected', COALESCE(NEW.rejection_reason, 'Your host application has been rejected.'),
      jsonb_build_object('status', 'rejected', 'reason', COALESCE(NEW.rejection_reason, ''), 'application_id', NEW.id), false);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notify_on_host_application_status: %', SQLERRM; RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_on_recharge_completed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_amount BIGINT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('completed', 'success') THEN RETURN NEW; END IF;
  v_amount := COALESCE(NEW.diamond_amount, NEW.coins_amount, 0);
  INSERT INTO notifications (user_id, type, title, message, data, is_read)
  VALUES (NEW.user_id, 'diamonds_credited', '💎 Diamonds Credited!', v_amount || ' Diamonds added to your account',
    jsonb_build_object('amount', v_amount, 'transaction_id', NEW.id), false);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notify_on_recharge_completed: %', SQLERRM; RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_on_live_stream_started()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_host TEXT;
BEGIN
  IF NEW.status != 'live' THEN RETURN NEW; END IF;
  SELECT display_name INTO v_host FROM profiles WHERE id = NEW.host_id;
  v_host := COALESCE(v_host, 'A host');
  INSERT INTO notifications (user_id, type, title, message, data, is_read)
  SELECT f.follower_id, 'live_started', '🔴 ' || v_host || ' is Live!', COALESCE(NEW.title, 'Join now!'),
    jsonb_build_object('host_id', NEW.host_id, 'host_name', v_host, 'stream_id', NEW.id, 'stream_title', COALESCE(NEW.title, '')), false
  FROM followers f WHERE f.following_id = NEW.host_id LIMIT 500;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notify_on_live_stream_started: %', SQLERRM; RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.notify_on_withdrawal_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_title TEXT; v_msg TEXT; v_type TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status IN ('approved', 'completed') THEN
    v_type := 'withdrawal_approved'; v_title := '✅ Withdrawal Approved!'; v_msg := '$' || NEW.amount || ' withdrawal approved';
  ELSIF NEW.status = 'rejected' THEN
    v_type := 'withdrawal_rejected'; v_title := '❌ Withdrawal Rejected'; v_msg := COALESCE(NEW.notes, 'Your withdrawal was rejected');
  ELSE RETURN NEW;
  END IF;
  INSERT INTO notifications (user_id, type, title, message, data, is_read)
  SELECT a.owner_id, v_type, v_title, v_msg, jsonb_build_object('status', NEW.status, 'amount', NEW.amount, 'withdrawal_id', NEW.id), false
  FROM agencies a WHERE a.id = NEW.agency_id AND a.owner_id IS NOT NULL;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'notify_on_withdrawal_status: %', SQLERRM; RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.grant_welcome_bonus()
RETURNS TRIGGER AS $$
DECLARE
  bonus_amount INTEGER := 50;
BEGIN
  IF EXISTS (SELECT 1 FROM public.welcome_bonuses WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles
  SET coins = COALESCE(coins, 0) + bonus_amount
  WHERE id = NEW.id;

  INSERT INTO public.welcome_bonuses (user_id, bonus_coins)
  VALUES (NEW.id, bonus_amount)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.id,
    'welcome_bonus',
    '🎁 Welcome Bonus!',
    'Welcome to meriLIVE! You have received 50 bonus coins. Explore and enjoy!',
    jsonb_build_object('bonus_coins', bonus_amount, 'type', 'welcome_bonus')
  );

  RAISE LOG '[WelcomeBonus] Granted % coins to user %', bonus_amount, NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.claim_parcel_reward(p_parcel_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parcel RECORD;
  v_result JSONB;
BEGIN
  -- Get and lock the parcel
  SELECT up.*, pt.name as template_name
  INTO v_parcel
  FROM user_parcels up
  JOIN parcel_templates pt ON pt.id = up.template_id
  WHERE up.id = p_parcel_id
    AND up.user_id = auth.uid()
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parcel not found');
  END IF;
  
  IF v_parcel.status = 'opened' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed');
  END IF;
  
  IF v_parcel.status = 'expired' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parcel expired');
  END IF;
  
  IF v_parcel.status = 'locked' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parcel is locked');
  END IF;
  
  -- Check timer
  IF v_parcel.expires_at IS NOT NULL AND v_parcel.expires_at < now() THEN
    UPDATE user_parcels SET status = 'expired' WHERE id = p_parcel_id;
    RETURN jsonb_build_object('success', false, 'error', 'Parcel expired');
  END IF;
  
  IF v_parcel.unlocks_at IS NOT NULL AND v_parcel.unlocks_at > now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not yet unlocked');
  END IF;
  
  -- Mark as opened
  UPDATE user_parcels 
  SET status = 'opened', opened_at = now()
  WHERE id = p_parcel_id;
  
  -- Insert claim record
  INSERT INTO parcel_claims (user_id, parcel_id, reward_type, reward_amount)
  VALUES (auth.uid(), p_parcel_id, 
    COALESCE(v_parcel.actual_reward_type, 'coins'),
    COALESCE(v_parcel.actual_reward_amount, 0));
  
  -- Distribute reward
  IF COALESCE(v_parcel.actual_reward_type, 'coins') = 'coins' THEN
    SET LOCAL app.bypass_profile_protection = 'true';
    UPDATE profiles 
    SET coins = coins + COALESCE(v_parcel.actual_reward_amount, 0)
    WHERE id = auth.uid();
  ELSIF v_parcel.actual_reward_type = 'beans' THEN
    SET LOCAL app.bypass_profile_protection = 'true';
    UPDATE profiles 
    SET beans = beans + COALESCE(v_parcel.actual_reward_amount, 0)
    WHERE id = auth.uid();
  END IF;
  
  RETURN jsonb_build_object(
    'success', true, 
    'reward_type', COALESCE(v_parcel.actual_reward_type, 'coins'),
    'reward_amount', COALESCE(v_parcel.actual_reward_amount, 0),
    'parcel_name', v_parcel.template_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_user_parcels(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_profile RECORD;
  v_existing INT;
BEGIN
  -- Get user profile for segmentation
  SELECT level, is_vip, coins, created_at INTO v_profile
  FROM profiles WHERE id = p_user_id;
  
  FOR v_template IN 
    SELECT * FROM parcel_templates 
    WHERE is_active = true
    ORDER BY display_order
  LOOP
    -- Check if user already has this template assigned (active)
    SELECT COUNT(*) INTO v_existing
    FROM user_parcels 
    WHERE user_id = p_user_id 
      AND template_id = v_template.id 
      AND status IN ('locked', 'unlocked');
    
    IF v_existing > 0 THEN CONTINUE; END IF;
    
    -- Check segment
    IF v_template.target_segment = 'new_user' AND v_profile.created_at < now() - interval '7 days' THEN
      CONTINUE;
    END IF;
    IF v_template.target_segment = 'vip' AND NOT COALESCE(v_profile.is_vip, false) THEN
      CONTINUE;
    END IF;
    IF v_template.min_level > COALESCE(v_profile.level, 1) OR v_template.max_level < COALESCE(v_profile.level, 1) THEN
      CONTINUE;
    END IF;
    
    -- Create parcel
    INSERT INTO user_parcels (
      user_id, template_id, status,
      required_progress, current_progress,
      actual_reward_type, actual_reward_amount,
      unlocks_at, expires_at
    ) VALUES (
      p_user_id, v_template.id,
      CASE WHEN v_template.unlock_condition = 'none' THEN 'unlocked' ELSE 'locked' END,
      v_template.unlock_threshold, 0,
      v_template.reward_type, v_template.reward_amount,
      CASE WHEN v_template.unlock_wait_hours > 0 THEN now() + (v_template.unlock_wait_hours || ' hours')::interval ELSE NULL END,
      CASE WHEN v_template.expiry_hours > 0 THEN now() + (v_template.expiry_hours || ' hours')::interval ELSE NULL END
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_application_logs()
RETURNS TABLE(system_error_logs_deleted bigint, session_security_logs_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_system_deleted bigint := 0;
  v_session_deleted bigint := 0;
BEGIN
  DELETE FROM public.system_error_logs
  WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_system_deleted = ROW_COUNT;

  DELETE FROM public.session_security_logs
  WHERE created_at < now() - interval '14 days';
  GET DIAGNOSTICS v_session_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_system_deleted, v_session_deleted;
END;
$$;