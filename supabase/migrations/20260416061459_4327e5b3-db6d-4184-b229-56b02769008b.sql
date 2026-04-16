
-- Seed default daily tasks
INSERT INTO public.daily_tasks (title, description, task_type, requirement_type, requirement_value, reward_beans, reward_coins, icon_name, icon_color, display_order, is_active, target_audience, duration_hours)
VALUES
  ('Go Live', 'Start your first live stream today', 'daily', 'first_live', 1, 100, 20, 'video', '#FF4444', 0, true, 'host', 24),
  ('Live 30 Minutes', 'Stream for at least 30 minutes', 'daily', 'live_minutes', 30, 200, 50, 'clock', '#FF8800', 1, true, 'host', 24),
  ('Receive a Gift', 'Receive at least 1 gift during live', 'daily', 'first_gift', 1, 150, 30, 'gift', '#FF44AA', 2, true, 'host', 24),
  ('Get 10 Viewers', 'Have at least 10 viewers in your stream', 'daily', 'viewers', 10, 300, 80, 'users', '#4488FF', 3, true, 'host', 24),
  ('Send 5 Messages', 'Send at least 5 chat messages', 'daily', 'messages_sent', 5, 50, 10, 'message-circle', '#44DD88', 4, true, 'all', 24),
  ('Get 3 Followers', 'Gain 3 new followers today', 'daily', 'followers', 3, 100, 25, 'star', '#FFB800', 5, true, 'all', 24)
ON CONFLICT DO NOTHING;

-- Add missing RLS policies for user_task_progress (users need to read/insert their own progress)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Users can view own task progress' AND polrelid = 'public.user_task_progress'::regclass) THEN
    EXECUTE 'CREATE POLICY "Users can view own task progress" ON public.user_task_progress FOR SELECT USING (auth.uid() = user_id)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Users can insert own task progress' AND polrelid = 'public.user_task_progress'::regclass) THEN
    EXECUTE 'CREATE POLICY "Users can insert own task progress" ON public.user_task_progress FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'Users can update own task progress' AND polrelid = 'public.user_task_progress'::regclass) THEN
    EXECUTE 'CREATE POLICY "Users can update own task progress" ON public.user_task_progress FOR UPDATE USING (auth.uid() = user_id)';
  END IF;
END $$;
