CREATE OR REPLACE FUNCTION public.notify_coin_transfer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_type = 'trader_to_user' OR NEW.sender_type = 'trader_to_agency' THEN
    PERFORM public.create_notification(
      NEW.receiver_id,
      'coins_received',
      'Coins Received! 💎',
      'You have received ' || NEW.amount::text || ' diamonds.',
      jsonb_build_object('amount', NEW.amount, 'sender_id', NEW.sender_id, 'transfer_type', NEW.sender_type)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_reporter_on_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'resolved' AND (OLD.status IS DISTINCT FROM 'resolved') THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
    VALUES (
      NEW.reporter_id, 'report_resolved', 'Report Update',
      COALESCE('Your report has been reviewed. Admin response: ' || NEW.admin_notes,
        'Your report has been reviewed and resolved. Thank you for helping keep the community safe.'),
      jsonb_build_object('report_id', NEW.id, 'report_category', NEW.report_category, 'action_taken', NEW.action_taken, 'admin_notes', NEW.admin_notes, 'resolved_at', NEW.reviewed_at),
      false
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_sensitive_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) IN ('authenticated', 'anon') THEN
    IF NEW.coins IS DISTINCT FROM OLD.coins THEN RAISE EXCEPTION 'Direct modification of coins is not allowed'; END IF;
    IF NEW.beans IS DISTINCT FROM OLD.beans THEN RAISE EXCEPTION 'Direct modification of beans is not allowed'; END IF;
    IF NEW.diamonds IS DISTINCT FROM OLD.diamonds THEN RAISE EXCEPTION 'Direct modification of diamonds is not allowed'; END IF;
    IF NEW.total_earnings IS DISTINCT FROM OLD.total_earnings THEN RAISE EXCEPTION 'Direct modification of total_earnings is not allowed'; END IF;
    IF NEW.pending_earnings IS DISTINCT FROM OLD.pending_earnings THEN RAISE EXCEPTION 'Direct modification of pending_earnings is not allowed'; END IF;
    IF NEW.weekly_earnings IS DISTINCT FROM OLD.weekly_earnings THEN RAISE EXCEPTION 'Direct modification of weekly_earnings is not allowed'; END IF;
    IF NEW.total_consumption IS DISTINCT FROM OLD.total_consumption THEN RAISE EXCEPTION 'Direct modification of total_consumption is not allowed'; END IF;
    IF NEW.total_recharged IS DISTINCT FROM OLD.total_recharged THEN RAISE EXCEPTION 'Direct modification of total_recharged is not allowed'; END IF;
    IF NEW.is_host IS DISTINCT FROM OLD.is_host THEN RAISE EXCEPTION 'Direct modification of is_host is not allowed'; END IF;
    IF NEW.host_status IS DISTINCT FROM OLD.host_status THEN RAISE EXCEPTION 'Direct modification of host_status is not allowed'; END IF;
    IF NEW.host_level IS DISTINCT FROM OLD.host_level THEN RAISE EXCEPTION 'Direct modification of host_level is not allowed'; END IF;
    IF NEW.is_verified IS DISTINCT FROM OLD.is_verified THEN RAISE EXCEPTION 'Direct modification of is_verified is not allowed'; END IF;
    IF NEW.is_face_verified IS DISTINCT FROM OLD.is_face_verified THEN RAISE EXCEPTION 'Direct modification of is_face_verified is not allowed'; END IF;
    IF NEW.user_level IS DISTINCT FROM OLD.user_level THEN RAISE EXCEPTION 'Direct modification of user_level is not allowed'; END IF;
    IF NEW.max_user_level IS DISTINCT FROM OLD.max_user_level THEN RAISE EXCEPTION 'Direct modification of max_user_level is not allowed'; END IF;
    IF NEW.current_vip_tier_id IS DISTINCT FROM OLD.current_vip_tier_id THEN RAISE EXCEPTION 'Direct modification of current_vip_tier_id is not allowed'; END IF;
    IF NEW.vip_expires_at IS DISTINCT FROM OLD.vip_expires_at THEN RAISE EXCEPTION 'Direct modification of vip_expires_at is not allowed'; END IF;
    IF NEW.is_blocked IS DISTINCT FROM OLD.is_blocked THEN RAISE EXCEPTION 'Direct modification of is_blocked is not allowed'; END IF;
    IF NEW.agency_id IS DISTINCT FROM OLD.agency_id THEN RAISE EXCEPTION 'Direct modification of agency_id is not allowed'; END IF;
    IF NEW.is_agency_owner IS DISTINCT FROM OLD.is_agency_owner THEN RAISE EXCEPTION 'Direct modification of is_agency_owner is not allowed'; END IF;
    IF NEW.face_hash IS DISTINCT FROM OLD.face_hash THEN RAISE EXCEPTION 'Direct modification of face_hash is not allowed'; END IF;
    IF NEW.phone_violation_count IS DISTINCT FROM OLD.phone_violation_count THEN RAISE EXCEPTION 'Direct modification of phone_violation_count is not allowed'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_task_progress_writes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IS DISTINCT FROM session_user THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Direct modification of task progress is not allowed. Use the update_task_progress function.';
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_helper_trader_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_level integer := 1;
BEGIN
  SELECT COALESCE(MAX(level_number), 1) INTO _new_level
  FROM trader_level_tiers
  WHERE is_active = true
    AND upgrade_cost_usd <= COALESCE(NEW.total_level_upgrade_cost, 0)
    AND level_number <= 4;
  IF _new_level > COALESCE(NEW.trader_level, 1) THEN
    NEW.trader_level := _new_level;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_app_uid_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.app_uid IS NULL OR NEW.app_uid = '' THEN
    NEW.app_uid := public.generate_unique_app_uid();
  END IF;
  RETURN NEW;
END;
$$;

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
  IF v_code = UPPER(COALESCE(OLD.country_code, '')) AND TG_OP = 'UPDATE' THEN RETURN NEW; END IF;
  IF v_code = '' THEN RETURN NEW; END IF;

  v_country_name := CASE v_code
    WHEN 'AF' THEN 'Afghanistan' WHEN 'AL' THEN 'Albania' WHEN 'DZ' THEN 'Algeria'
    WHEN 'AR' THEN 'Argentina' WHEN 'AM' THEN 'Armenia' WHEN 'AU' THEN 'Australia'
    WHEN 'AT' THEN 'Austria' WHEN 'AZ' THEN 'Azerbaijan' WHEN 'BH' THEN 'Bahrain'
    WHEN 'BD' THEN 'Bangladesh' WHEN 'BY' THEN 'Belarus' WHEN 'BE' THEN 'Belgium'
    WHEN 'BJ' THEN 'Benin' WHEN 'BT' THEN 'Bhutan' WHEN 'BO' THEN 'Bolivia'
    WHEN 'BA' THEN 'Bosnia and Herzegovina' WHEN 'BR' THEN 'Brazil' WHEN 'BN' THEN 'Brunei'
    WHEN 'BG' THEN 'Bulgaria' WHEN 'BF' THEN 'Burkina Faso' WHEN 'KH' THEN 'Cambodia'
    WHEN 'CM' THEN 'Cameroon' WHEN 'CA' THEN 'Canada' WHEN 'CF' THEN 'Central African Republic'
    WHEN 'TD' THEN 'Chad' WHEN 'CL' THEN 'Chile' WHEN 'CN' THEN 'China'
    WHEN 'CO' THEN 'Colombia' WHEN 'CD' THEN 'Congo' WHEN 'CR' THEN 'Costa Rica'
    WHEN 'HR' THEN 'Croatia' WHEN 'CU' THEN 'Cuba' WHEN 'CY' THEN 'Cyprus'
    WHEN 'CZ' THEN 'Czech Republic' WHEN 'DK' THEN 'Denmark' WHEN 'DJ' THEN 'Djibouti'
    WHEN 'DO' THEN 'Dominican Republic' WHEN 'EC' THEN 'Ecuador' WHEN 'EG' THEN 'Egypt'
    WHEN 'SV' THEN 'El Salvador' WHEN 'GQ' THEN 'Equatorial Guinea' WHEN 'ER' THEN 'Eritrea'
    WHEN 'EE' THEN 'Estonia' WHEN 'ET' THEN 'Ethiopia' WHEN 'FI' THEN 'Finland'
    WHEN 'FR' THEN 'France' WHEN 'GA' THEN 'Gabon' WHEN 'GM' THEN 'Gambia'
    WHEN 'GE' THEN 'Georgia' WHEN 'DE' THEN 'Germany' WHEN 'GH' THEN 'Ghana'
    WHEN 'GR' THEN 'Greece' WHEN 'GT' THEN 'Guatemala' WHEN 'GN' THEN 'Guinea'
    WHEN 'HT' THEN 'Haiti' WHEN 'HN' THEN 'Honduras' WHEN 'HK' THEN 'Hong Kong'
    WHEN 'HU' THEN 'Hungary' WHEN 'IS' THEN 'Iceland' WHEN 'IN' THEN 'India'
    WHEN 'ID' THEN 'Indonesia' WHEN 'IR' THEN 'Iran' WHEN 'IQ' THEN 'Iraq'
    WHEN 'IE' THEN 'Ireland' WHEN 'IL' THEN 'Israel' WHEN 'IT' THEN 'Italy'
    WHEN 'CI' THEN 'Ivory Coast' WHEN 'JM' THEN 'Jamaica' WHEN 'JP' THEN 'Japan'
    WHEN 'JO' THEN 'Jordan' WHEN 'KZ' THEN 'Kazakhstan' WHEN 'KE' THEN 'Kenya'
    WHEN 'KW' THEN 'Kuwait' WHEN 'KG' THEN 'Kyrgyzstan' WHEN 'LA' THEN 'Laos'
    WHEN 'LV' THEN 'Latvia' WHEN 'LB' THEN 'Lebanon' WHEN 'LY' THEN 'Libya'
    WHEN 'LT' THEN 'Lithuania' WHEN 'LU' THEN 'Luxembourg' WHEN 'MO' THEN 'Macau'
    WHEN 'MG' THEN 'Madagascar' WHEN 'MW' THEN 'Malawi' WHEN 'MY' THEN 'Malaysia'
    WHEN 'MV' THEN 'Maldives' WHEN 'ML' THEN 'Mali' WHEN 'MT' THEN 'Malta'
    WHEN 'MR' THEN 'Mauritania' WHEN 'MU' THEN 'Mauritius' WHEN 'MX' THEN 'Mexico'
    WHEN 'MD' THEN 'Moldova' WHEN 'MN' THEN 'Mongolia' WHEN 'ME' THEN 'Montenegro'
    WHEN 'MA' THEN 'Morocco' WHEN 'MZ' THEN 'Mozambique' WHEN 'MM' THEN 'Myanmar'
    WHEN 'NA' THEN 'Namibia' WHEN 'NP' THEN 'Nepal' WHEN 'NL' THEN 'Netherlands'
    WHEN 'NZ' THEN 'New Zealand' WHEN 'NI' THEN 'Nicaragua' WHEN 'NE' THEN 'Niger'
    WHEN 'NG' THEN 'Nigeria' WHEN 'KP' THEN 'North Korea' WHEN 'MK' THEN 'North Macedonia'
    WHEN 'NO' THEN 'Norway' WHEN 'OM' THEN 'Oman' WHEN 'PK' THEN 'Pakistan'
    WHEN 'PS' THEN 'Palestine' WHEN 'PA' THEN 'Panama' WHEN 'PG' THEN 'Papua New Guinea'
    WHEN 'PY' THEN 'Paraguay' WHEN 'PE' THEN 'Peru' WHEN 'PH' THEN 'Philippines'
    WHEN 'PL' THEN 'Poland' WHEN 'PT' THEN 'Portugal' WHEN 'QA' THEN 'Qatar'
    WHEN 'RO' THEN 'Romania' WHEN 'RU' THEN 'Russia' WHEN 'RW' THEN 'Rwanda'
    WHEN 'SA' THEN 'Saudi Arabia' WHEN 'SN' THEN 'Senegal' WHEN 'RS' THEN 'Serbia'
    WHEN 'SL' THEN 'Sierra Leone' WHEN 'SG' THEN 'Singapore' WHEN 'SK' THEN 'Slovakia'
    WHEN 'SI' THEN 'Slovenia' WHEN 'SO' THEN 'Somalia' WHEN 'ZA' THEN 'South Africa'
    WHEN 'KR' THEN 'South Korea' WHEN 'SS' THEN 'South Sudan' WHEN 'ES' THEN 'Spain'
    WHEN 'LK' THEN 'Sri Lanka' WHEN 'SD' THEN 'Sudan' WHEN 'SR' THEN 'Suriname'
    WHEN 'SE' THEN 'Sweden' WHEN 'CH' THEN 'Switzerland' WHEN 'SY' THEN 'Syria'
    WHEN 'TW' THEN 'Taiwan' WHEN 'TJ' THEN 'Tajikistan' WHEN 'TZ' THEN 'Tanzania'
    WHEN 'TH' THEN 'Thailand' WHEN 'TG' THEN 'Togo' WHEN 'TN' THEN 'Tunisia'
    WHEN 'TR' THEN 'Turkey' WHEN 'TM' THEN 'Turkmenistan' WHEN 'UG' THEN 'Uganda'
    WHEN 'UA' THEN 'Ukraine' WHEN 'AE' THEN 'United Arab Emirates' WHEN 'GB' THEN 'United Kingdom'
    WHEN 'US' THEN 'United States' WHEN 'UY' THEN 'Uruguay' WHEN 'UZ' THEN 'Uzbekistan'
    WHEN 'VE' THEN 'Venezuela' WHEN 'VN' THEN 'Vietnam' WHEN 'YE' THEN 'Yemen'
    WHEN 'ZM' THEN 'Zambia' WHEN 'ZW' THEN 'Zimbabwe'
    ELSE v_code
  END;

  v_country_flag := CASE v_code
    WHEN 'AF' THEN '🇦🇫' WHEN 'AL' THEN '🇦🇱' WHEN 'DZ' THEN '🇩🇿'
    WHEN 'AR' THEN '🇦🇷' WHEN 'AM' THEN '🇦🇲' WHEN 'AU' THEN '🇦🇺'
    WHEN 'AT' THEN '🇦🇹' WHEN 'AZ' THEN '🇦🇿' WHEN 'BH' THEN '🇧🇭'
    WHEN 'BD' THEN '🇧🇩' WHEN 'BY' THEN '🇧🇾' WHEN 'BE' THEN '🇧🇪'
    WHEN 'BJ' THEN '🇧🇯' WHEN 'BT' THEN '🇧🇹' WHEN 'BO' THEN '🇧🇴'
    WHEN 'BA' THEN '🇧🇦' WHEN 'BR' THEN '🇧🇷' WHEN 'BN' THEN '🇧🇳'
    WHEN 'BG' THEN '🇧🇬' WHEN 'BF' THEN '🇧🇫' WHEN 'KH' THEN '🇰🇭'
    WHEN 'CM' THEN '🇨🇲' WHEN 'CA' THEN '🇨🇦' WHEN 'CF' THEN '🇨🇫'
    WHEN 'TD' THEN '🇹🇩' WHEN 'CL' THEN '🇨🇱' WHEN 'CN' THEN '🇨🇳'
    WHEN 'CO' THEN '🇨🇴' WHEN 'CD' THEN '🇨🇩' WHEN 'CR' THEN '🇨🇷'
    WHEN 'HR' THEN '🇭🇷' WHEN 'CU' THEN '🇨🇺' WHEN 'CY' THEN '🇨🇾'
    WHEN 'CZ' THEN '🇨🇿' WHEN 'DK' THEN '🇩🇰' WHEN 'DJ' THEN '🇩🇯'
    WHEN 'DO' THEN '🇩🇴' WHEN 'EC' THEN '🇪🇨' WHEN 'EG' THEN '🇪🇬'
    WHEN 'SV' THEN '🇸🇻' WHEN 'GQ' THEN '🇬🇶' WHEN 'ER' THEN '🇪🇷'
    WHEN 'EE' THEN '🇪🇪' WHEN 'ET' THEN '🇪🇹' WHEN 'FI' THEN '🇫🇮'
    WHEN 'FR' THEN '🇫🇷' WHEN 'GA' THEN '🇬🇦' WHEN 'GM' THEN '🇬🇲'
    WHEN 'GE' THEN '🇬🇪' WHEN 'DE' THEN '🇩🇪' WHEN 'GH' THEN '🇬🇭'
    WHEN 'GR' THEN '🇬🇷' WHEN 'GT' THEN '🇬🇹' WHEN 'GN' THEN '🇬🇳'
    WHEN 'HT' THEN '🇭🇹' WHEN 'HN' THEN '🇭🇳' WHEN 'HK' THEN '🇭🇰'
    WHEN 'HU' THEN '🇭🇺' WHEN 'IS' THEN '🇮🇸' WHEN 'IN' THEN '🇮🇳'
    WHEN 'ID' THEN '🇮🇩' WHEN 'IR' THEN '🇮🇷' WHEN 'IQ' THEN '🇮🇶'
    WHEN 'IE' THEN '🇮🇪' WHEN 'IL' THEN '🇮🇱' WHEN 'IT' THEN '🇮🇹'
    WHEN 'CI' THEN '🇨🇮' WHEN 'JM' THEN '🇯🇲' WHEN 'JP' THEN '🇯🇵'
    WHEN 'JO' THEN '🇯🇴' WHEN 'KZ' THEN '🇰🇿' WHEN 'KE' THEN '🇰🇪'
    WHEN 'KW' THEN '🇰🇼' WHEN 'KG' THEN '🇰🇬' WHEN 'LA' THEN '🇱🇦'
    WHEN 'LV' THEN '🇱🇻' WHEN 'LB' THEN '🇱🇧' WHEN 'LY' THEN '🇱🇾'
    WHEN 'LT' THEN '🇱🇹' WHEN 'LU' THEN '🇱🇺' WHEN 'MO' THEN '🇲🇴'
    WHEN 'MG' THEN '🇲🇬' WHEN 'MW' THEN '🇲🇼' WHEN 'MY' THEN '🇲🇾'
    WHEN 'MV' THEN '🇲🇻' WHEN 'ML' THEN '🇲🇱' WHEN 'MT' THEN '🇲🇹'
    WHEN 'MR' THEN '🇲🇷' WHEN 'MU' THEN '🇲🇺' WHEN 'MX' THEN '🇲🇽'
    WHEN 'MD' THEN '🇲🇩' WHEN 'MN' THEN '🇲🇳' WHEN 'ME' THEN '🇲🇪'
    WHEN 'MA' THEN '🇲🇦' WHEN 'MZ' THEN '🇲🇿' WHEN 'MM' THEN '🇲🇲'
    WHEN 'NA' THEN '🇳🇦' WHEN 'NP' THEN '🇳🇵' WHEN 'NL' THEN '🇳🇱'
    WHEN 'NZ' THEN '🇳🇿' WHEN 'NI' THEN '🇳🇮' WHEN 'NE' THEN '🇳🇪'
    WHEN 'NG' THEN '🇳🇬' WHEN 'KP' THEN '🇰🇵' WHEN 'MK' THEN '🇲🇰'
    WHEN 'NO' THEN '🇳🇴' WHEN 'OM' THEN '🇴🇲' WHEN 'PK' THEN '🇵🇰'
    WHEN 'PS' THEN '🇵🇸' WHEN 'PA' THEN '🇵🇦' WHEN 'PG' THEN '🇵🇬'
    WHEN 'PY' THEN '🇵🇾' WHEN 'PE' THEN '🇵🇪' WHEN 'PH' THEN '🇵🇭'
    WHEN 'PL' THEN '🇵🇱' WHEN 'PT' THEN '🇵🇹' WHEN 'QA' THEN '🇶🇦'
    WHEN 'RO' THEN '🇷🇴' WHEN 'RU' THEN '🇷🇺' WHEN 'RW' THEN '🇷🇼'
    WHEN 'SA' THEN '🇸🇦' WHEN 'SN' THEN '🇸🇳' WHEN 'RS' THEN '🇷🇸'
    WHEN 'SL' THEN '🇸🇱' WHEN 'SG' THEN '🇸🇬' WHEN 'SK' THEN '🇸🇰'
    WHEN 'SI' THEN '🇸🇮' WHEN 'SO' THEN '🇸🇴' WHEN 'ZA' THEN '🇿🇦'
    WHEN 'KR' THEN '🇰🇷' WHEN 'SS' THEN '🇸🇸' WHEN 'ES' THEN '🇪🇸'
    WHEN 'LK' THEN '🇱🇰' WHEN 'SD' THEN '🇸🇩' WHEN 'SR' THEN '🇸🇷'
    WHEN 'SE' THEN '🇸🇪' WHEN 'CH' THEN '🇨🇭' WHEN 'SY' THEN '🇸🇾'
    WHEN 'TW' THEN '🇹🇼' WHEN 'TJ' THEN '🇹🇯' WHEN 'TZ' THEN '🇹🇿'
    WHEN 'TH' THEN '🇹🇭' WHEN 'TG' THEN '🇹🇬' WHEN 'TN' THEN '🇹🇳'
    WHEN 'TR' THEN '🇹🇷' WHEN 'TM' THEN '🇹🇲' WHEN 'UG' THEN '🇺🇬'
    WHEN 'UA' THEN '🇺🇦' WHEN 'AE' THEN '🇦🇪' WHEN 'GB' THEN '🇬🇧'
    WHEN 'US' THEN '🇺🇸' WHEN 'UY' THEN '🇺🇾' WHEN 'UZ' THEN '🇺🇿'
    WHEN 'VE' THEN '🇻🇪' WHEN 'VN' THEN '🇻🇳' WHEN 'YE' THEN '🇾🇪'
    WHEN 'ZM' THEN '🇿🇲' WHEN 'ZW' THEN '🇿🇼'
    ELSE '🏳️'
  END;

  NEW.country_name := v_country_name;
  NEW.country_flag := v_country_flag;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_message_read_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE conversations
    SET last_message = NEW.content,
        last_message_at = NOW(),
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_admin_notify_face_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _display_name text;
BEGIN
  SELECT display_name INTO _display_name FROM profiles WHERE id = NEW.user_id;
  INSERT INTO admin_notifications (type, title, message, data, priority, target_role)
  VALUES ('face_verification', 'New Face Verification', COALESCE(_display_name, 'User') || ' submitted face verification',
    jsonb_build_object('submission_id', NEW.id, 'user_id', NEW.user_id, 'display_name', _display_name), 'medium', 'all');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_admin_notify_helper_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _display_name text;
BEGIN
  SELECT display_name INTO _display_name FROM profiles WHERE id = NEW.user_id;
  INSERT INTO admin_notifications (type, title, message, data, priority, target_role)
  VALUES ('helper_application', 'New Helper Application', COALESCE(_display_name, 'User') || ' applied to become a helper',
    jsonb_build_object('application_id', NEW.id, 'user_id', NEW.user_id, 'display_name', _display_name), 'medium', 'all');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_admin_notify_helper_topup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _display_name text;
BEGIN
  SELECT display_name INTO _display_name FROM profiles WHERE id = NEW.helper_id;
  INSERT INTO admin_notifications (type, title, message, data, priority, target_role)
  VALUES ('helper_topup', 'New Helper Top-up Request', COALESCE(_display_name, 'Helper') || ' requested top-up of ' || NEW.amount::text,
    jsonb_build_object('request_id', NEW.id, 'helper_id', NEW.helper_id, 'amount', NEW.amount), 'high', 'all');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_admin_notify_helper_upgrade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _display_name text;
BEGIN
  SELECT display_name INTO _display_name FROM profiles WHERE id = NEW.helper_id;
  INSERT INTO admin_notifications (type, title, message, data, priority, target_role)
  VALUES ('helper_upgrade', 'Helper Upgrade Request', COALESCE(_display_name, 'Helper') || ' requested level upgrade',
    jsonb_build_object('request_id', NEW.id, 'helper_id', NEW.helper_id), 'medium', 'all');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_admin_notify_new_agency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO admin_notifications (type, title, message, data, priority, target_role)
  VALUES ('new_agency', 'New Agency Created', 'Agency "' || NEW.name || '" has been created',
    jsonb_build_object('agency_id', NEW.id, 'agency_name', NEW.name, 'agency_code', NEW.agency_code), 'medium', 'all');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_admin_notify_support_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _display_name text;
BEGIN
  SELECT display_name INTO _display_name FROM profiles WHERE id = NEW.user_id;
  INSERT INTO admin_notifications (type, title, message, data, priority, target_role)
  VALUES ('support_ticket', 'New Support Ticket', COALESCE(_display_name, 'User') || ': ' || LEFT(NEW.subject, 50),
    jsonb_build_object('ticket_id', NEW.id, 'user_id', NEW.user_id, 'subject', NEW.subject, 'category', NEW.category), 'high', 'all');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_admin_notify_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agency_name text;
BEGIN
  SELECT name INTO _agency_name FROM agencies WHERE id = NEW.agency_id;
  INSERT INTO admin_notifications (type, title, message, data, priority, target_role)
  VALUES ('withdrawal', 'New Withdrawal Request', COALESCE(_agency_name, 'Agency') || ' requested withdrawal of $' || NEW.amount::text,
    jsonb_build_object('withdrawal_id', NEW.id, 'agency_id', NEW.agency_id, 'amount', NEW.amount), 'high', 'all');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trigger_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.settings.edge_function_url', true) || '/send-push-notification',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)),
    body := jsonb_build_object('user_id', NEW.user_id, 'title', NEW.title, 'message', NEW.message, 'data', COALESCE(NEW.data, '{}'::jsonb))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_admin_users_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_agency_level()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total_weekly_income numeric;
  _new_level text;
  _new_commission numeric;
BEGIN
  SELECT COALESCE(SUM(p.weekly_earnings), 0) INTO _total_weekly_income
  FROM agency_hosts ah JOIN profiles p ON p.id = ah.host_id
  WHERE ah.agency_id = NEW.id AND ah.status = 'active';

  SELECT level_code, commission_rate INTO _new_level, _new_commission
  FROM agency_level_tiers
  WHERE is_active = true AND min_weekly_income <= _total_weekly_income
  ORDER BY min_weekly_income DESC LIMIT 1;

  IF _new_level IS NOT NULL AND _new_level IS DISTINCT FROM NEW.level THEN
    NEW.level := _new_level;
    NEW.commission_rate := _new_commission;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_agency_level_from_performance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_level text;
  _new_commission numeric;
BEGIN
  SELECT level_code, commission_rate INTO _new_level, _new_commission
  FROM agency_level_tiers
  WHERE is_active = true AND min_weekly_income <= COALESCE(NEW.total_income, 0)
  ORDER BY min_weekly_income DESC LIMIT 1;

  IF _new_level IS NOT NULL THEN
    UPDATE agencies SET level = _new_level, commission_rate = _new_commission, updated_at = NOW()
    WHERE id = NEW.agency_id AND (level IS DISTINCT FROM _new_level);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_agency_level_on_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _agency_id uuid;
BEGIN
  SELECT agency_id INTO _agency_id FROM agency_hosts WHERE host_id = NEW.id AND status = 'active' LIMIT 1;
  IF _agency_id IS NOT NULL THEN
    UPDATE agencies SET updated_at = NOW() WHERE id = _agency_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_agency_ranking_metrics()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_consumption_on_recharge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE profiles
    SET total_consumption = COALESCE(total_consumption, 0) + COALESCE(NEW.amount, 0)
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_game_provider_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_host_call_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _host_id uuid;
  _earnings integer;
BEGIN
  IF NEW.status = 'ended' AND OLD.status <> 'ended' AND NEW.coin_cost > 0 THEN
    _host_id := NEW.receiver_id;
    _earnings := FLOOR(NEW.coin_cost * 0.6);
    UPDATE profiles
    SET beans = COALESCE(beans, 0) + _earnings,
        total_earnings = COALESCE(total_earnings, 0) + _earnings,
        pending_earnings = COALESCE(pending_earnings, 0) + _earnings
    WHERE id = _host_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_host_earnings_on_gift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _beans_amount integer;
BEGIN
  _beans_amount := FLOOR(NEW.coin_cost * 0.6);
  UPDATE profiles
  SET beans = COALESCE(beans, 0) + _beans_amount,
      total_earnings = COALESCE(total_earnings, 0) + _beans_amount,
      pending_earnings = COALESCE(pending_earnings, 0) + _beans_amount
  WHERE id = NEW.receiver_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_host_level_on_earnings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_total_recharged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    UPDATE profiles
    SET total_recharged = COALESCE(total_recharged, 0) + COALESCE(NEW.amount, 0)
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_user_level_comprehensive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalculate_user_level(NEW.id);
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.validate_user_task_progress_claim() CASCADE;
CREATE OR REPLACE FUNCTION public.validate_user_task_progress_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_claimed = true AND OLD.is_claimed = false THEN
    IF COALESCE(NEW.current_count, 0) < COALESCE(NEW.required_count, 1) THEN
      RAISE EXCEPTION 'Cannot claim reward: task not completed (% / %)', NEW.current_count, NEW.required_count;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;