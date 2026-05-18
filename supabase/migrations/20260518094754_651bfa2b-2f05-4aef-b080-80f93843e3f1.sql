-- Final hardening: keep profile verification state and face submission state in sync
-- so no approved user can remain visible in Pending.

CREATE OR REPLACE FUNCTION public.sync_face_submission_from_profile_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Avoid recursion when profile update was itself caused by a submission update.
  IF current_setting('app.syncing_face_submission', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.face_verification_status = 'approved'
     AND COALESCE(NEW.is_face_verified, false) = true THEN
    PERFORM set_config('app.syncing_profile_face', 'true', true);

    UPDATE public.face_verification_submissions
       SET status = 'approved',
           verification_type = CASE WHEN COALESCE(NEW.is_host, false) OR lower(trim(coalesce(NEW.gender, ''))) = 'female' THEN 'host' ELSE 'user' END,
           reviewed_at = COALESCE(reviewed_at, now()),
           reviewed_by = COALESCE(reviewed_by, public.current_admin_id_from_header()),
           rejection_reason = NULL,
           admin_notes = COALESCE(admin_notes, 'Synced from approved profile verification'),
           updated_at = now()
     WHERE user_id = NEW.id
       AND public.face_verification_status_bucket(status) = 'pending';

    PERFORM set_config('app.syncing_profile_face', 'false', true);
  ELSIF NEW.face_verification_status = 'rejected' THEN
    PERFORM set_config('app.syncing_profile_face', 'true', true);

    UPDATE public.face_verification_submissions
       SET status = 'rejected',
           reviewed_at = COALESCE(reviewed_at, now()),
           reviewed_by = COALESCE(reviewed_by, public.current_admin_id_from_header()),
           rejection_reason = COALESCE(rejection_reason, 'Rejected by admin'),
           admin_notes = COALESCE(admin_notes, 'Synced from rejected profile verification'),
           updated_at = now()
     WHERE user_id = NEW.id
       AND public.face_verification_status_bucket(status) = 'pending';

    PERFORM set_config('app.syncing_profile_face', 'false', true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_face_submission_from_profile_status ON public.profiles;
CREATE TRIGGER trg_sync_face_submission_from_profile_status
AFTER INSERT OR UPDATE OF face_verification_status, is_face_verified, is_host, gender ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_face_submission_from_profile_status();

CREATE OR REPLACE FUNCTION public.sync_profile_from_face_submission_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
  v_gender text;
  v_face_url text;
  v_avatar_src text;
BEGIN
  IF current_setting('app.syncing_profile_face', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF public.face_verification_status_bucket(NEW.status) = 'approved' THEN
    v_role := CASE WHEN lower(trim(coalesce(NEW.verification_type, ''))) = 'host' THEN 'host' ELSE 'user' END;
    v_gender := CASE WHEN v_role = 'host' THEN 'female' ELSE 'male' END;
    v_face_url := COALESCE(NEW.front_url, NEW.selfie_url, NEW.profile_photo_url, NEW.face_image_url);
    v_avatar_src := COALESCE(NEW.profile_photo_url, NEW.front_url, NEW.selfie_url);

    PERFORM set_config('app.syncing_face_submission', 'true', true);

    UPDATE public.profiles
       SET is_verified = true,
           is_face_verified = true,
           face_verified_at = COALESCE(face_verified_at, now()),
           face_verification_status = 'approved',
           face_verification_image = COALESCE(v_face_url, face_verification_image),
           avatar_url = COALESCE(v_avatar_src, avatar_url),
           gender = v_gender,
           is_host = (v_role = 'host'),
           host_status = CASE WHEN v_role = 'host' THEN 'approved' ELSE NULL END,
           updated_at = now()
     WHERE id = NEW.user_id;

    PERFORM set_config('app.syncing_face_submission', 'false', true);
  ELSIF public.face_verification_status_bucket(NEW.status) = 'rejected' THEN
    PERFORM set_config('app.syncing_face_submission', 'true', true);

    UPDATE public.profiles
       SET is_face_verified = false,
           face_verified_at = NULL,
           face_verification_status = 'rejected',
           is_host = false,
           host_status = CASE WHEN is_host THEN 'rejected' ELSE host_status END,
           updated_at = now()
     WHERE id = NEW.user_id;

    PERFORM set_config('app.syncing_face_submission', 'false', true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_from_face_submission_status ON public.face_verification_submissions;
CREATE TRIGGER trg_sync_profile_from_face_submission_status
AFTER INSERT OR UPDATE OF status, verification_type ON public.face_verification_submissions
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_from_face_submission_status();

-- Repair already-approved profile rows whose submission was still pending.
DO $$
BEGIN
  PERFORM set_config('app.syncing_profile_face', 'true', true);

  UPDATE public.face_verification_submissions s
     SET status = 'approved',
         verification_type = CASE WHEN COALESCE(p.is_host, false) OR lower(trim(coalesce(p.gender, ''))) = 'female' THEN 'host' ELSE 'user' END,
         reviewed_at = COALESCE(s.reviewed_at, now()),
         reviewed_by = COALESCE(s.reviewed_by, public.current_admin_id_from_header()),
         rejection_reason = NULL,
         admin_notes = COALESCE(s.admin_notes, 'Repaired: synced from approved profile verification'),
         updated_at = now()
    FROM public.profiles p
   WHERE p.id = s.user_id
     AND p.face_verification_status = 'approved'
     AND COALESCE(p.is_face_verified, false) = true
     AND public.face_verification_status_bucket(s.status) = 'pending';

  UPDATE public.face_verification_submissions s
     SET status = 'rejected',
         reviewed_at = COALESCE(s.reviewed_at, now()),
         reviewed_by = COALESCE(s.reviewed_by, public.current_admin_id_from_header()),
         rejection_reason = COALESCE(s.rejection_reason, 'Rejected by admin'),
         admin_notes = COALESCE(s.admin_notes, 'Repaired: synced from rejected profile verification'),
         updated_at = now()
    FROM public.profiles p
   WHERE p.id = s.user_id
     AND p.face_verification_status = 'rejected'
     AND public.face_verification_status_bucket(s.status) = 'pending';

  PERFORM set_config('app.syncing_profile_face', 'false', true);
END $$;

-- Make the main admin action idempotent and always atomic.
CREATE OR REPLACE FUNCTION public._execute_admin_pending_action(_action_type text, _payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid; v_amount integer; v_agency uuid; v_delta bigint;
  v_gender text; v_submission uuid; v_action text; v_reason text;
  v_set_gender text; v_approve_as text;
  v_sub public.face_verification_submissions%ROWTYPE;
  v_face_url text; v_avatar_src text;
BEGIN
  PERFORM set_config('app.bypass_profile_protection','true',true);

  IF _action_type='add_diamonds' THEN
    v_user:=(_payload->>'user_id')::uuid; v_amount:=(_payload->>'amount')::int;
    UPDATE public.profiles SET coins=COALESCE(coins,0)+v_amount WHERE id=v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type='add_beans' THEN
    v_user:=(_payload->>'user_id')::uuid; v_amount:=(_payload->>'amount')::int;
    UPDATE public.profiles SET beans=COALESCE(beans,0)+v_amount WHERE id=v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type='agency_beans_adjust' THEN
    v_agency:=(_payload->>'agency_id')::uuid; v_delta:=(_payload->>'delta')::bigint;
    UPDATE public.agencies SET beans_balance=COALESCE(beans_balance,0)+v_delta WHERE id=v_agency;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type='update_gender' THEN
    v_user:=(_payload->>'user_id')::uuid; v_gender:=lower(trim(_payload->>'gender'));
    IF v_gender NOT IN ('female','male') THEN
      RETURN jsonb_build_object('success',false,'error','Invalid gender');
    END IF;
    UPDATE public.profiles SET gender=v_gender,
       is_host = CASE WHEN v_gender='female' AND COALESCE(is_face_verified,false) THEN true ELSE false END,
       host_status = CASE WHEN v_gender='female' AND COALESCE(is_face_verified,false) THEN 'approved'
                          WHEN v_gender='female' THEN 'pending_face' ELSE NULL END,
       updated_at=now() WHERE id=v_user;
    RETURN jsonb_build_object('success',true);

  ELSIF _action_type='process_face_verification' THEN
    v_submission:=(_payload->>'submission_id')::uuid;
    v_action:=lower(trim(coalesce(_payload->>'action','')));
    v_reason:=NULLIF(trim(coalesce(_payload->>'reason','')),'');
    v_approve_as:=lower(trim(coalesce(_payload->>'approve_as','')));
    v_set_gender:=lower(trim(coalesce(_payload->>'set_gender','')));

    SELECT * INTO v_sub FROM public.face_verification_submissions WHERE id=v_submission FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Submission not found'); END IF;
    v_user:=v_sub.user_id;

    IF v_action NOT IN ('approve','reject') THEN
      RETURN jsonb_build_object('success',false,'error','Invalid action');
    END IF;

    IF v_action='approve' THEN
      v_approve_as:=CASE WHEN v_approve_as IN ('host','user') THEN v_approve_as ELSE NULL END;
      v_gender:=COALESCE(
        NULLIF(v_set_gender,''),
        CASE WHEN v_approve_as='host' THEN 'female' WHEN v_approve_as='user' THEN 'male' ELSE NULL END,
        CASE WHEN lower(trim(coalesce(v_sub.verification_type,'')))='host' THEN 'female'
             WHEN lower(trim(coalesce(v_sub.verification_type,'')))='user' THEN 'male' ELSE NULL END,
        (SELECT lower(trim(COALESCE(p.gender,''))) FROM public.profiles p WHERE p.id=v_user),
        'male');
      IF v_gender NOT IN ('female','male') THEN v_gender:='male'; END IF;
      v_approve_as:=CASE WHEN v_gender='female' THEN 'host' ELSE 'user' END;
      v_face_url:=COALESCE(v_sub.front_url, v_sub.selfie_url, v_sub.profile_photo_url, v_sub.face_image_url);
      v_avatar_src:=COALESCE(v_sub.profile_photo_url, v_sub.front_url, v_sub.selfie_url);

      UPDATE public.face_verification_submissions
         SET status='approved', verification_type=v_approve_as,
             reviewed_by=public.current_admin_id_from_header(), reviewed_at=now(),
             admin_notes=COALESCE(v_reason,admin_notes),
             rejection_reason=NULL, updated_at=now()
       WHERE id=v_submission;

      UPDATE public.profiles
         SET is_verified=true, is_face_verified=true, face_verified_at=now(),
             face_verification_status='approved',
             face_verification_image=COALESCE(v_face_url,face_verification_image),
             avatar_url=COALESCE(v_avatar_src,avatar_url),
             gender=v_gender,
             is_host=(v_approve_as='host'),
             host_status=CASE WHEN v_approve_as='host' THEN 'approved' ELSE NULL END,
             updated_at=now()
       WHERE id=v_user;

      RETURN jsonb_build_object('success',true,'gender',v_gender,'verification_type',v_approve_as,'approved_as',v_approve_as);
    ELSE
      UPDATE public.face_verification_submissions
         SET status='rejected',
             reviewed_by=public.current_admin_id_from_header(), reviewed_at=now(),
             admin_notes=COALESCE(v_reason,admin_notes),
             rejection_reason=COALESCE(v_reason,rejection_reason,'Rejected by admin'),
             updated_at=now()
       WHERE id=v_submission;

      UPDATE public.profiles
         SET is_face_verified=false, face_verification_image=NULL, face_verified_at=NULL,
             face_verification_status='rejected',
             is_host=false,
             host_status=CASE WHEN is_host THEN 'rejected' ELSE host_status END,
             updated_at=now()
       WHERE id=v_user;

      RETURN jsonb_build_object('success',true,'verification_type',lower(trim(coalesce(v_sub.verification_type,'user'))));
    END IF;

  ELSIF _action_type='remove_face_verification' THEN
    v_user:=(_payload->>'user_id')::uuid;
    UPDATE public.face_verification_submissions
       SET status='rejected', reviewed_by=public.current_admin_id_from_header(), reviewed_at=now(),
           admin_notes=COALESCE(admin_notes,'')||E'\n[Revoked by admin]', updated_at=now()
     WHERE user_id=v_user AND public.face_verification_status_bucket(status)='approved';
    UPDATE public.profiles
       SET is_face_verified=false,
           face_verification_status='pending_face',
           is_host=false,
           host_status=CASE WHEN is_host THEN 'pending_face' ELSE host_status END,
           updated_at=now()
     WHERE id=v_user;
    RETURN jsonb_build_object('success',true);
  END IF;
  RAISE EXCEPTION 'Unknown action_type: %', _action_type;
END
$$;

GRANT EXECUTE ON FUNCTION public.sync_face_submission_from_profile_status() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_profile_from_face_submission_status() TO anon, authenticated;