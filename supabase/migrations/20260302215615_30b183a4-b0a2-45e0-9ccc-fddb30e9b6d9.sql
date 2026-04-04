
-- Fix 15 female profiles that are incorrectly not set as hosts
-- Use set_config to bypass the profile protection trigger

DO $$
DECLARE
  user_ids uuid[] := ARRAY[
    '048b7e65-d18a-4a46-8b65-6901b408791e',
    'e636423e-cffb-49b8-a256-d88315db864c',
    '1379e099-f3c2-4652-a600-99dd29845afb',
    '9e88871b-272f-43dd-a1ed-2ac4ccbe10ec',
    '5dc21865-d3cf-4104-96d8-8ba2c05bcf49',
    'b313aad3-1de2-4cb1-b42a-1861972027d5',
    'da258d5c-c867-4d33-b657-feb80ccc6aab',
    '08890805-7548-4ecc-bae5-4824190c0886',
    'e3452140-b4ee-46f2-9ba1-2a7a3dc11fc8',
    'ef2d9819-16ef-4853-a55d-bca2c5a50e08',
    '7fe42a5a-1515-4aba-9a68-713b9a19b0b2',
    'c78bcab5-2dd8-47e9-b190-5b76cef9d736',
    'f846d19a-efe4-443a-8087-a41291ed4601',
    '00ac872f-bd75-463c-b436-dc10d8905b27',
    'e66892c7-62fb-4056-9d3d-258e0e61edd7'
  ];
  uid uuid;
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  -- Convert all 15 profiles to host
  UPDATE public.profiles
  SET is_host = true,
      host_status = 'approved',
      updated_at = now()
  WHERE id = ANY(user_ids);

  -- Send notification to each user
  FOREACH uid IN ARRAY user_ids LOOP
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      uid,
      'system',
      '🎤 Your ID has been converted to Host!',
      'Your account has been upgraded to Host status. You can now complete Face Verification to start going live. Go to your Profile → Face Verification to get verified.',
      jsonb_build_object('action', 'host_upgrade', 'requires_verification', true)
    );
  END LOOP;
END $$;
