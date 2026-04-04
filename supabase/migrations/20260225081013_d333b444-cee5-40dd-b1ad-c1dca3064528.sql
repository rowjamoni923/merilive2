-- Fix Shifa's face verification status (was approved as host but is_face_verified was not set)
UPDATE profiles 
SET is_face_verified = true, face_verified_at = now() 
WHERE id = '1ba6de4d-0d5c-4751-8a56-820c44603f9a' 
AND is_verified = true 
AND is_face_verified = false;

-- Also fix any other users who are verified hosts but missing is_face_verified
UPDATE profiles 
SET is_face_verified = true, face_verified_at = COALESCE(face_verified_at, now())
WHERE is_verified = true 
AND is_host = true 
AND host_status = 'approved'
AND (is_face_verified = false OR is_face_verified IS NULL);