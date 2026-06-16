CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at_desc
ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created_at_desc
ON public.notifications (user_id, created_at DESC)
WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_swift_pay_topups_external_status
ON public.swift_pay_topups (external_user_id, status);

CREATE INDEX IF NOT EXISTS idx_user_level_tiers_type_active_level
ON public.user_level_tiers (tier_type, is_active, level_number);

CREATE INDEX IF NOT EXISTS idx_profiles_host_gender_country
ON public.profiles (is_host, gender, country_code, country_flag)
WHERE is_host = true AND country_code IS NOT NULL AND country_flag IS NOT NULL;