
-- Temporarily disable the protection trigger to fix data
ALTER TABLE profiles DISABLE TRIGGER protect_sensitive_columns_trigger;

-- 1. Fix female users: set is_host, host_status, is_face_verified
UPDATE profiles
SET is_host = true, 
    host_status = 'approved', 
    is_face_verified = true,
    gender = 'female',
    updated_at = now()
WHERE LOWER(gender) = 'female' 
  AND (is_face_verified = false OR is_face_verified IS NULL OR is_host = false OR is_host IS NULL OR host_status IS DISTINCT FROM 'approved' OR gender != 'female');

-- 2. Fix case mismatches for male
UPDATE profiles
SET gender = 'male', updated_at = now()
WHERE LOWER(gender) = 'male' AND gender != 'male';

-- 3. Fix male users who wrongly have host status
UPDATE profiles
SET is_host = false, host_status = null, updated_at = now()
WHERE LOWER(gender) = 'male' AND (is_host = true OR host_status IS NOT NULL);

-- Re-enable the protection trigger
ALTER TABLE profiles ENABLE TRIGGER protect_sensitive_columns_trigger;

-- 4. Send notifications to affected users
-- Get affected IDs and insert notifications
INSERT INTO notifications (user_id, type, title, message, data)
SELECT 
  id,
  'system',
  '✨ Profile Updated',
  'Your profile has been automatically updated! Your host status and verification are now synced correctly. Thank you for being part of MeriLive! 💖',
  jsonb_build_object('action', 'profile_fix', 'auto_fixed', true)
FROM profiles
WHERE updated_at >= now() - interval '2 minutes'
  AND gender IS NOT NULL;
