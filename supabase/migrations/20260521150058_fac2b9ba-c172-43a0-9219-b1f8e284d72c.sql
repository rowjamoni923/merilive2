INSERT INTO public.admin_broadcast (topic, version, updated_at)
VALUES ('blocked_users', 0, now())
ON CONFLICT (topic) DO NOTHING;