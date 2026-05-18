
CREATE OR REPLACE FUNCTION public.tg_notify_face_verification_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bucket text;
  v_old_bucket text;
  v_role text;
  v_title text;
  v_message text;
  v_type text;
  v_category text;
  v_reason text;
  v_pref_enabled boolean;
BEGIN
  v_bucket := public.face_verification_status_bucket(NEW.status);
  v_old_bucket := CASE WHEN TG_OP = 'UPDATE' THEN public.face_verification_status_bucket(OLD.status) ELSE NULL END;

  IF v_bucket NOT IN ('approved','rejected') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND v_old_bucket = v_bucket THEN
    RETURN NEW;
  END IF;

  v_type := CASE WHEN v_bucket = 'approved' THEN 'face_verification_approved' ELSE 'face_verification_rejected' END;
  v_category := v_type; -- separate category per outcome

  -- Honor user preference: row absent = enabled (default true)
  SELECT enabled INTO v_pref_enabled
    FROM public.notification_preferences
   WHERE user_id = NEW.user_id AND category = v_category
   LIMIT 1;
  IF v_pref_enabled IS NOT NULL AND v_pref_enabled = false THEN
    RETURN NEW;
  END IF;

  -- Dedupe within 30s
  IF EXISTS (
    SELECT 1 FROM public.notifications
     WHERE user_id = NEW.user_id AND type = v_type
       AND created_at > now() - interval '30 seconds'
  ) THEN
    RETURN NEW;
  END IF;

  v_role := lower(trim(coalesce(NEW.verification_type, 'user')));
  v_reason := NULLIF(trim(coalesce(NEW.rejection_reason, NEW.admin_notes, '')), '');

  IF v_bucket = 'approved' THEN
    v_title := 'Congratulations! Face Verification Approved';
    v_message := CASE
      WHEN v_role = 'host' THEN 'Your face verification has been approved. You are now a verified Host and can go live!'
      ELSE 'Your face verification has been approved. Your account is now fully verified.'
    END;
  ELSE
    v_title := 'Face Verification Rejected';
    v_message := COALESCE(
      'Your face verification was rejected. Reason: ' || v_reason || '. Please try again with a clear, well-lit selfie.',
      'Your face verification was rejected. Please try again with a clear, well-lit selfie matching the on-screen instructions.'
    );
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, data)
  VALUES (
    NEW.user_id, v_title, v_message, v_type,
    jsonb_build_object(
      'submission_id', NEW.id,
      'verification_type', v_role,
      'status', v_bucket,
      'reason', v_reason,
      'category', v_category
    )
  );

  RETURN NEW;
END;
$$;
