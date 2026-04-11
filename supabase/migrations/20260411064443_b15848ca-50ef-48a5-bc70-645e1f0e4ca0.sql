
-- Add missing columns to role_frames
ALTER TABLE public.role_frames
  ADD COLUMN IF NOT EXISTS animation_type text DEFAULT 'svga',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS preview_url text;

-- Add missing columns to user_role_frames for assignment feature
ALTER TABLE public.user_role_frames
  ADD COLUMN IF NOT EXISTS role_type text DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS is_equipped boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS notes text;

-- Ensure RLS policies exist for admin access
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_role_frames' AND policyname = 'admin_full_access_user_role_frames') THEN
    CREATE POLICY "admin_full_access_user_role_frames" ON public.user_role_frames FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_role_frames' AND policyname = 'users_view_own_role_frames') THEN
    CREATE POLICY "users_view_own_role_frames" ON public.user_role_frames FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- Add to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_role_frames;
