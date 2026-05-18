
INSERT INTO public.new_host_live_bonus_settings
  (hour_number, bonus_beans, eligible_program_days, daily_reset_offset_minutes,
   beans_per_hour, max_hours_per_day, eligible_days,
   day_number, target_minutes, bonus_amount, is_active)
SELECT h, 9000, 3, 0, 9000, 5, 3, h, 60, 9000, true
FROM generate_series(1,5) AS h
ON CONFLICT DO NOTHING;

UPDATE public.new_host_live_bonus_settings
SET is_active = (hour_number BETWEEN 1 AND 5);

ALTER TABLE public.daily_tasks
  ADD COLUMN IF NOT EXISTS show_in_live boolean NOT NULL DEFAULT true;

UPDATE public.daily_tasks
SET show_in_live = true
WHERE requirement_type IN ('first_live','live_minutes','first_gift','viewers','messages_sent');

INSERT INTO public.daily_tasks
  (task_type, title, description, requirement_type, requirement_value, reward_beans, reward_coins,
   icon_name, icon_color, target_audience, target_gender, is_active, display_order, show_in_live)
VALUES
  ('watch_live', 'Watch a Live', 'Watch any host live for 5 minutes', 'watch_live', 5, 30, 8,
   'video', '#a855f7', 'user', 'all', true, 10, false),
  ('send_gift', 'Send a Gift', 'Send a gift to any host', 'send_gift', 1, 80, 15,
   'gift', '#ec4899', 'user', 'all', true, 11, false),
  ('share_app', 'Share App', 'Share the app with a friend', 'share_app', 1, 50, 10,
   'message-circle', '#22d3ee', 'user', 'all', true, 12, false)
ON CONFLICT DO NOTHING;
