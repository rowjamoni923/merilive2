-- Set all non-blocked hosts as online
UPDATE profiles SET is_online = true, last_seen_at = NOW() WHERE is_host = true AND is_blocked = false;