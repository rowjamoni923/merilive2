CREATE OR REPLACE FUNCTION public.tg_auto_reject_face_gender_mismatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rek jsonb;
  v_final text;
  v_raw text;
  v_expected text;
  v_gender_conf numeric;
  v_profile_gender text;
  v_profile_is_host boolean;
  v_front_err text;
  v_left_err text;
  v_right_err text;
BEGIN
  IF public.face_verification_status_bucket(NEW.status) IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  v_rek := coalesce(NEW.ai_analysis, '{}'::jsonb) -> 'rekognition';
  IF v_rek IS NULL OR v_rek = 'null'::jsonb THEN
    RETURN NEW;
  END IF;

  v_final := lower(trim(coalesce(v_rek ->> 'final_gender', '')));
  v_raw := lower(trim(coalesce(v_rek ->> 'gender_value', '')));
  v_gender_conf := CASE
    WHEN coalesce(v_rek ->> 'gender_confidence', '') ~ '^-?\d+(\.\d+)?$' THEN (v_rek ->> 'gender_confidence')::numeric
    ELSE 0
  END;
  v_front_err := trim(coalesce(v_rek ->> 'front_error', ''));
  v_left_err := trim(coalesce(v_rek ->> 'left_error', ''));
  v_right_err := trim(coalesce(v_rek ->> 'right_error', ''));

  SELECT lower(trim(coalesce(gender, ''))), coalesce(is_host, false)
  INTO v_profile_gender, v_profile_is_host
  FROM public.profiles
  WHERE id = NEW.user_id;

  v_expected := CASE
    WHEN lower(trim(coalesce(NEW.verification_type, ''))) = 'host' THEN 'female'
    WHEN lower(trim(coalesce(NEW.verification_type, ''))) IN ('user', 'face') THEN 'male'
    WHEN v_profile_gender IN ('male', 'female') THEN v_profile_gender
    WHEN v_profile_is_host THEN 'female'
    ELSE 'male'
  END;

  IF v_expected IN ('male', 'female')
     AND coalesce(nullif(v_final, ''), v_raw) IN ('male', 'female')
     AND coalesce(nullif(v_final, ''), v_raw) <> v_expected
     AND v_gender_conf >= 70
     AND v_front_err = '' AND v_left_err = '' AND v_right_err = '' THEN
    NEW.status := 'rejected';
    NEW.reviewed_at := coalesce(NEW.reviewed_at, now());
    NEW.rejection_reason := format(
      'Account verification requires "%s" but live face detected as "%s" (%.1f%% confidence). Please contact Support Chat to resolve.',
      v_expected,
      coalesce(nullif(v_final, ''), v_raw),
      v_gender_conf
    );
    NEW.admin_notes := concat_ws(E'\n', nullif(trim(coalesce(NEW.admin_notes, '')), ''), format(
      '[auto-reject] gender_mismatch trigger: expected=%s detected=%s confidence=%.1f%%',
      v_expected,
      coalesce(nullif(v_final, ''), v_raw),
      v_gender_conf
    ));
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_reject_face_gender_mismatch ON public.face_verification_submissions;
CREATE TRIGGER trg_auto_reject_face_gender_mismatch
BEFORE INSERT OR UPDATE OF ai_analysis, status, verification_type ON public.face_verification_submissions
FOR EACH ROW
EXECUTE FUNCTION public.tg_auto_reject_face_gender_mismatch();

REVOKE ALL ON FUNCTION public.tg_auto_reject_face_gender_mismatch() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_auto_reject_face_gender_mismatch() TO service_role;