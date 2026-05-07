ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS who_can_call_me text DEFAULT 'everyone';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS who_can_message_me text DEFAULT 'everyone';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_device_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_notifications boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notification_vibrate boolean DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS incoming_call_sound text DEFAULT 'default';

COMMENT ON COLUMN public.profiles.who_can_call_me IS 'Call privacy: everyone | friends | nobody';
COMMENT ON COLUMN public.profiles.who_can_message_me IS 'DM privacy: everyone | friends | nobody';
COMMENT ON COLUMN public.profiles.active_device_id IS 'Last enrolled device id (PersistentDeviceId); mismatched clients may be signed out.';
COMMENT ON COLUMN public.profiles.email_notifications IS 'User opt-in for email notifications.';
COMMENT ON COLUMN public.profiles.notification_vibrate IS 'Vibrate for pushes / incoming call alerts.';
COMMENT ON COLUMN public.profiles.incoming_call_sound IS 'Logical ringtone key (e.g. default, subtle).';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_who_can_call_me_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_who_can_call_me_check
  CHECK (who_can_call_me IS NULL OR who_can_call_me IN ('everyone', 'friends', 'nobody'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_who_can_message_me_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_who_can_message_me_check
  CHECK (who_can_message_me IS NULL OR who_can_message_me IN ('everyone', 'friends', 'nobody'));

CREATE OR REPLACE FUNCTION public.update_profile(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_old_gender text;
  v_display text;
  v_bio text;
  v_cc text;
  v_cn text;
  v_cf text;
  v_hide boolean;
  v_lang text;
  v_birth date;
  v_age int;
  v_gender text;
  v_call text;
  v_msg text;
  v_email_notif boolean;
  v_vibrate boolean;
  v_sound text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid payload');
  END IF;

  SELECT lower(trim(gender)) INTO v_old_gender FROM public.profiles WHERE id = uid;

  IF p_patch ? 'display_name' THEN
    v_display := trim(p_patch->>'display_name');
    IF char_length(v_display) < 2 OR char_length(v_display) > 24 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Display name must be 2–24 characters');
    END IF;
  END IF;

  IF p_patch ? 'bio' THEN
    v_bio := trim(p_patch->>'bio');
    IF char_length(v_bio) > 200 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Bio must be at most 200 characters');
    END IF;
  END IF;

  IF p_patch ? 'country_code' THEN
    v_cc := nullif(trim(p_patch->>'country_code'), '');
    IF v_cc IS NOT NULL AND char_length(v_cc) > 2 THEN
      v_cc := left(v_cc, 2);
    END IF;
  END IF;
  IF p_patch ? 'country_name' THEN
    v_cn := nullif(trim(p_patch->>'country_name'), '');
  END IF;
  IF p_patch ? 'country_flag' THEN
    v_cf := nullif(trim(p_patch->>'country_flag'), '');
  END IF;
  IF p_patch ? 'hide_location' THEN
    v_hide := (p_patch->>'hide_location')::boolean;
  END IF;
  IF p_patch ? 'language' THEN
    v_lang := nullif(trim(p_patch->>'language'), '');
  END IF;

  IF p_patch ? 'who_can_call_me' THEN
    v_call := lower(nullif(trim(p_patch->>'who_can_call_me'), ''));
    IF v_call IS NOT NULL AND v_call NOT IN ('everyone', 'friends', 'nobody') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid call privacy');
    END IF;
  END IF;

  IF p_patch ? 'who_can_message_me' THEN
    v_msg := lower(nullif(trim(p_patch->>'who_can_message_me'), ''));
    IF v_msg IS NOT NULL AND v_msg NOT IN ('everyone', 'friends', 'nobody') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid message privacy');
    END IF;
  END IF;

  IF p_patch ? 'email_notifications' THEN
    v_email_notif := (p_patch->>'email_notifications')::boolean;
  END IF;

  IF p_patch ? 'notification_vibrate' THEN
    v_vibrate := (p_patch->>'notification_vibrate')::boolean;
  END IF;

  IF p_patch ? 'incoming_call_sound' THEN
    v_sound := nullif(trim(p_patch->>'incoming_call_sound'), '');
    IF v_sound IS NOT NULL AND char_length(v_sound) > 64 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid sound key');
    END IF;
  END IF;

  v_age := NULL;

  IF p_patch ? 'birthday' THEN
    IF p_patch->'birthday' IS NULL OR jsonb_typeof(p_patch->'birthday') = 'null' OR (trim(coalesce(p_patch->>'birthday','')) = '') THEN
      v_birth := NULL;
      v_age := NULL;
    ELSE
      BEGIN
        v_birth := (p_patch->>'birthday')::date;
      EXCEPTION WHEN others THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid birthday');
      END;
      IF v_birth IS NOT NULL AND v_birth > (CURRENT_DATE - interval '18 years')::date THEN
        RETURN jsonb_build_object('success', false, 'error', 'You must be at least 18');
      END IF;
      IF v_birth IS NOT NULL THEN
        v_age := EXTRACT(YEAR FROM age(v_birth))::int;
        IF v_age > 100 THEN
          RETURN jsonb_build_object('success', false, 'error', 'Invalid birthday');
        END IF;
      END IF;
    END IF;
  END IF;

  IF p_patch ? 'age' AND NOT (p_patch ? 'birthday') THEN
    IF p_patch->>'age' IS NULL OR trim(p_patch->>'age') = '' THEN
      v_age := NULL;
    ELSE
      BEGIN
        v_age := (p_patch->>'age')::int;
      EXCEPTION WHEN others THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid age');
      END;
      IF v_age IS NOT NULL AND (v_age < 18 OR v_age > 100) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Age must be 18–100');
      END IF;
    END IF;
  END IF;

  IF p_patch ? 'gender' THEN
    v_gender := lower(trim(p_patch->>'gender'));
    IF v_gender IS NOT NULL AND v_gender NOT IN ('male', 'female', 'other', 'prefer_not_to_say') THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid gender');
    END IF;
    IF v_old_gender IN ('male', 'female') AND v_gender IS DISTINCT FROM v_old_gender THEN
      RETURN jsonb_build_object('success', false, 'error', 'Gender is locked');
    END IF;
  END IF;

  UPDATE public.profiles SET
    display_name = CASE WHEN p_patch ? 'display_name' THEN v_display ELSE display_name END,
    bio = CASE WHEN p_patch ? 'bio' THEN v_bio ELSE bio END,
    country_code = CASE WHEN p_patch ? 'country_code' THEN COALESCE(v_cc, country_code) ELSE country_code END,
    country_name = CASE WHEN p_patch ? 'country_name' THEN COALESCE(v_cn, country_name) ELSE country_name END,
    country_flag = CASE WHEN p_patch ? 'country_flag' THEN COALESCE(v_cf, country_flag) ELSE country_flag END,
    hide_location = CASE WHEN p_patch ? 'hide_location' THEN v_hide ELSE hide_location END,
    language = CASE WHEN p_patch ? 'language' THEN COALESCE(v_lang, language) ELSE language END,
    who_can_call_me = CASE WHEN p_patch ? 'who_can_call_me' THEN COALESCE(v_call, who_can_call_me) ELSE who_can_call_me END,
    who_can_message_me = CASE WHEN p_patch ? 'who_can_message_me' THEN COALESCE(v_msg, who_can_message_me) ELSE who_can_message_me END,
    email_notifications = CASE WHEN p_patch ? 'email_notifications' THEN v_email_notif ELSE email_notifications END,
    notification_vibrate = CASE WHEN p_patch ? 'notification_vibrate' THEN v_vibrate ELSE notification_vibrate END,
    incoming_call_sound = CASE WHEN p_patch ? 'incoming_call_sound' THEN COALESCE(v_sound, incoming_call_sound) ELSE incoming_call_sound END,
    birthday = CASE WHEN p_patch ? 'birthday' THEN v_birth ELSE birthday END,
    age = CASE
      WHEN p_patch ? 'birthday' THEN v_age
      WHEN p_patch ? 'age' THEN v_age
      ELSE age
    END,
    gender = CASE WHEN p_patch ? 'gender' THEN COALESCE(v_gender, gender) ELSE gender END,
    updated_at = now()
  WHERE id = uid;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.update_profile(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_profile(jsonb) TO authenticated;