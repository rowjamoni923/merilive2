-- Auto-approve face verification from service-role edge function (auto-face-verify).
-- Mirrors the admin approve path (status → approved, profile flags + role flip)
-- but caller is the edge function (service_role) not an admin user.
-- Only auto-approves when AWS Rekognition has matched the face above thresholds.

CREATE OR REPLACE FUNCTION public.auto_approve_face_verification(
  _submission_id uuid,
  _detected_gender text,
  _verification_type text,
  _face_match numeric DEFAULT NULL,
  _face_confidence numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sub    public.face_verification_submissions%ROWTYPE;
  v_gender text;
  v_role   text;
  v_face_url text;
  v_avatar_src text;
  v_claims jsonb;
  v_jwt_role text;
BEGIN
  -- Service-role guard: this RPC must NEVER be callable from end-user JWTs.
  -- Edge functions invoking via SUPABASE_SERVICE_ROLE_KEY set role=service_role
  -- in JWT claims; everyone else is rejected.
  v_claims  := current_setting('request.jwt.claims', true)::jsonb;
  v_jwt_role := COALESCE(v_claims->>'role', '');
  IF v_jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'auto_approve_face_verification: service_role only';
  END IF;

  SELECT * INTO v_sub
    FROM public.face_verification_submissions
   WHERE id = _submission_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Submission not found');
  END IF;

  -- Idempotent: if already approved, return success with same payload.
  IF public.face_verification_status_bucket(v_sub.status) = 'approved' THEN
    RETURN jsonb_build_object('success', true, 'already_approved', true);
  END IF;

  v_gender := lower(trim(coalesce(_detected_gender, '')));
  IF v_gender NOT IN ('female','male') THEN
    v_gender := CASE
      WHEN lower(trim(coalesce(_verification_type,''))) = 'host' THEN 'female'
      ELSE 'male'
    END;
  END IF;

  -- Role MUST follow gender per [Gender role mapping policy]:
  -- female → host, male → user. verification_type hint is secondary.
  v_role := CASE WHEN v_gender = 'female' THEN 'host' ELSE 'user' END;

  v_face_url   := COALESCE(v_sub.front_url, v_sub.selfie_url, v_sub.profile_photo_url, v_sub.face_image_url);
  v_avatar_src := COALESCE(v_sub.profile_photo_url, v_sub.front_url, v_sub.selfie_url);

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- Approve THIS submission + any other pending rows for the same user
  -- (mirrors the admin path so leftover pending rows don't linger).
  UPDATE public.face_verification_submissions
     SET status            = 'approved',
         verification_type = v_role,
         reviewed_at       = now(),
         admin_notes       = COALESCE('[AUTO-APPROVED by AWS Rekognition: face_match='
                                      || COALESCE(_face_match::text, 'n/a')
                                      || '%, face_conf='
                                      || COALESCE(_face_confidence::text, 'n/a')
                                      || '%, gender=' || v_gender || ']', admin_notes),
         rejection_reason  = NULL,
         updated_at        = now()
   WHERE user_id = v_sub.user_id
     AND (id = _submission_id OR public.face_verification_status_bucket(status) = 'pending');

  UPDATE public.profiles
     SET is_verified              = true,
         is_face_verified         = true,
         face_verified_at         = now(),
         face_verification_status = 'approved',
         face_verification_image  = COALESCE(v_face_url, face_verification_image),
         avatar_url               = COALESCE(v_avatar_src, avatar_url),
         gender                   = v_gender,
         is_host                  = (v_role = 'host'),
         host_status              = CASE WHEN v_role = 'host' THEN 'approved' ELSE NULL END,
         updated_at               = now()
   WHERE id = v_sub.user_id;

  -- Notify the user — push trigger fires automatically (Pkg32).
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    v_sub.user_id,
    'verification_approved',
    '✅ Face Verified Instantly',
    CASE WHEN v_role = 'host'
         THEN 'Your face has been auto-verified. Host status active — you can go live now!'
         ELSE 'Your face has been auto-verified. Welcome aboard!'
    END,
    jsonb_build_object(
      'auto_approved', true,
      'face_match', _face_match,
      'face_confidence', _face_confidence,
      'role', v_role,
      'gender', v_gender
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'auto_approved', true,
    'approved_as', v_role,
    'gender', v_gender
  );
END;
$$;

-- Hard lock: revoke from anon/authenticated so only service_role can call it.
REVOKE ALL ON FUNCTION public.auto_approve_face_verification(uuid, text, text, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_approve_face_verification(uuid, text, text, numeric, numeric) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.auto_approve_face_verification(uuid, text, text, numeric, numeric) TO service_role;