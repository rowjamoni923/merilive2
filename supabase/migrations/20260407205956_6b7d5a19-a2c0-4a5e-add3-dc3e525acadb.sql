ALTER TABLE public.room_welcome_messages ALTER COLUMN room_id DROP NOT NULL;
ALTER TABLE public.room_welcome_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;