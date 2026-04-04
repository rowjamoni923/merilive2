-- Fix all approved hosts missing is_face_verified and is_verified
UPDATE profiles 
SET is_face_verified = true, 
    is_verified = true, 
    face_verified_at = COALESCE(face_verified_at, now())
WHERE is_host = true 
AND host_status = 'approved' 
AND (is_face_verified = false OR is_face_verified IS NULL OR is_verified = false OR is_verified IS NULL);

-- Update eligible_days to 10 as per the program spec
UPDATE new_host_live_bonus_settings 
SET eligible_days = 10 
WHERE is_active = true;