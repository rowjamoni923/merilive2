
-- Clear remaining active sessions for banned users (bypass protection since already blocked)
ALTER TABLE profiles DISABLE TRIGGER protect_sensitive_columns_trigger;
UPDATE profiles SET active_session_id = null WHERE is_blocked = true AND active_session_id IS NOT NULL;
ALTER TABLE profiles ENABLE TRIGGER protect_sensitive_columns_trigger;
