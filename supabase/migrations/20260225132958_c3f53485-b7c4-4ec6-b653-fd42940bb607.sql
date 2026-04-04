
-- Insert landing page configurable settings
INSERT INTO app_settings (setting_key, setting_value, category, description) VALUES
  ('landing_stat_downloads', '"50,000+"', 'landing', 'Landing page downloads stat'),
  ('landing_stat_rating', '"4.5★"', 'landing', 'Landing page rating stat'),
  ('landing_stat_hosts', '"1000+"', 'landing', 'Landing page live hosts stat'),
  ('landing_stat_support', '"24/7"', 'landing', 'Landing page support stat'),
  ('landing_host_daily_earn', '"$10"', 'landing', 'Host daily earning amount'),
  ('landing_host_bonus_days', '"10"', 'landing', 'Host bonus program duration days'),
  ('landing_host_daily_hours', '"5"', 'landing', 'Host daily streaming hours required'),
  ('landing_host_min_withdraw', '"$10"', 'landing', 'Minimum withdrawal amount'),
  ('landing_agency_sub_bonus', '"2%"', 'landing', 'Sub-agency bonus percentage'),
  ('landing_hero_title', '"MeriLive"', 'landing', 'Hero section title'),
  ('landing_hero_subtitle', '"Live Streaming · Video Call · Party Room · Virtual Gifts"', 'landing', 'Hero section subtitle'),
  ('landing_hero_description', '"Stream live, connect with friends, earn money as a host, and experience the future of social entertainment"', 'landing', 'Hero section description')
ON CONFLICT (setting_key) DO NOTHING;
