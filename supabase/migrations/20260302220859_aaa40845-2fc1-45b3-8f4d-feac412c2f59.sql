
-- Fix 3 female profiles that have is_host=false due to rejected status
-- These users are female but were rejected, so they need proper host status

DO $$
DECLARE
  user_ids uuid[] := ARRAY[
    '1018e02d-14e3-414c-8cbd-7971a236ee8a'::uuid,  -- TAURA (female, rejected)
    '39c6675e-ad02-4f00-a5c4-5f040e1a8929'::uuid,  -- Panty (Female, rejected)
    'a2252bc5-1a6f-45a4-b747-70dd39596a8b'::uuid   -- Ms.A (female, rejected)
  ];
  uid uuid;
BEGIN
  -- Bypass profile protection trigger
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  FOREACH uid IN ARRAY user_ids LOOP
    -- Update to proper host status
    UPDATE public.profiles
    SET is_host = true,
        host_status = 'approved',
        is_face_verified = true,
        gender = 'female',
        updated_at = now()
    WHERE id = uid;

    -- Send notification
    INSERT INTO public.notifications (user_id, type, title, message, is_read)
    VALUES (
      uid,
      'system',
      '🎤 Your ID has been converted to Host!',
      'Your account has been upgraded to Host status. You can now complete Face Verification to start going live!',
      false
    );
  END LOOP;

  -- Log admin action
  INSERT INTO public.admin_logs (action_type, target_type, details)
  VALUES (
    'batch_host_fix',
    'profile',
    jsonb_build_object('fixed_count', 3, 'reason', 'Female profiles with rejected host_status corrected to approved')
  );
END $$;
