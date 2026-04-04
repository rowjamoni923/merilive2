
-- Update existing 30-min task to Hour 1 (60 minutes)
UPDATE public.daily_tasks 
SET title = 'Live 1 Hour',
    description = 'Stream live for 1 hour to earn 18,000 Beans',
    requirement_value = 60,
    reward_beans = 18000,
    reward_coins = 0,
    show_in_live = true,
    display_order = 2,
    updated_at = now()
WHERE id = '9031f8df-a1f8-438a-ab8c-83b2d7ade0d9';

-- Insert Hour 2
INSERT INTO public.daily_tasks (title, description, requirement_type, requirement_value, reward_beans, reward_coins, icon_name, icon_color, display_order, is_active, show_in_live, task_type)
VALUES ('Live 2 Hours', 'Stream live for 2 hours to earn 18,000 Beans', 'live_minutes', 120, 18000, 0, 'clock', '#4ECDC4', 3, true, true, 'daily');

-- Insert Hour 3
INSERT INTO public.daily_tasks (title, description, requirement_type, requirement_value, reward_beans, reward_coins, icon_name, icon_color, display_order, is_active, show_in_live, task_type)
VALUES ('Live 3 Hours', 'Stream live for 3 hours to earn 18,000 Beans', 'live_minutes', 180, 18000, 0, 'clock', '#4ECDC4', 4, true, true, 'daily');

-- Insert Hour 4
INSERT INTO public.daily_tasks (title, description, requirement_type, requirement_value, reward_beans, reward_coins, icon_name, icon_color, display_order, is_active, show_in_live, task_type)
VALUES ('Live 4 Hours', 'Stream live for 4 hours to earn 18,000 Beans', 'live_minutes', 240, 18000, 0, 'clock', '#4ECDC4', 5, true, true, 'daily');

-- Insert Hour 5
INSERT INTO public.daily_tasks (title, description, requirement_type, requirement_value, reward_beans, reward_coins, icon_name, icon_color, display_order, is_active, show_in_live, task_type)
VALUES ('Live 5 Hours', 'Stream live for 5 hours to earn 18,000 Beans', 'live_minutes', 300, 18000, 0, 'clock', '#4ECDC4', 6, true, true, 'daily');

-- Re-order other tasks after these
UPDATE public.daily_tasks SET display_order = 7 WHERE requirement_type = 'viewers';
UPDATE public.daily_tasks SET display_order = 8 WHERE requirement_type = 'first_gift';
UPDATE public.daily_tasks SET display_order = 9 WHERE requirement_type = 'messages_sent';
