
-- Fix: Add anon SELECT policies for public-facing tables that need to be readable before login

-- banners: public content viewable by everyone
CREATE POLICY "Anon can view active banners"
ON public.banners FOR SELECT TO anon
USING (is_active = true);

-- gifts: users need to see gift catalog
CREATE POLICY "Anon can view active gifts"
ON public.gifts FOR SELECT TO anon
USING (is_active = true);

-- currency_rates: public reference data
CREATE POLICY "Anon can view active currency rates"
ON public.currency_rates FOR SELECT TO anon
USING (is_active = true);

-- coin_packages: users see packages before buying
CREATE POLICY "Anon can view active coin packages"
ON public.coin_packages FOR SELECT TO anon
USING (is_active = true);

-- game_settings: game info is public
CREATE POLICY "Anon can view active game settings"
ON public.game_settings FOR SELECT TO anon
USING (is_active = true);

-- topup_payment_methods: payment methods visible publicly
CREATE POLICY "Anon can view active topup payment methods"
ON public.topup_payment_methods FOR SELECT TO anon
USING (is_active = true);

-- popup_event_banners: promotional banners are public
CREATE POLICY "Anon can view active popup banners"
ON public.popup_event_banners FOR SELECT TO anon
USING (is_active = true);

-- system_error_logs: allow anon to INSERT error logs (for error tracking before login)
CREATE POLICY "Anon can insert error logs"
ON public.system_error_logs FOR INSERT TO anon
WITH CHECK (true);
