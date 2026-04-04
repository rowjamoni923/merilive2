
-- Send notification to all female hosts who haven't completed face verification
INSERT INTO notifications (user_id, type, title, message, data, is_read)
SELECT 
  id as user_id,
  'system' as type,
  '🎉 You are now a Host!' as title,
  'Congratulations! Your account has been upgraded to Host status. Please complete your Face Verification to unlock all Host features including Live Streaming, receiving gifts, and more. Go to Settings → Face Verification to get started.' as message,
  '{"action": "face_verification", "route": "/face-verification"}'::jsonb as data,
  false as is_read
FROM profiles
WHERE gender = 'female' 
  AND is_host = true 
  AND (is_face_verified = false OR is_face_verified IS NULL);
