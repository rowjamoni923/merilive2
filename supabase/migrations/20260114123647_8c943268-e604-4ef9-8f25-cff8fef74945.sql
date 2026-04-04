-- Daily Tasks System
CREATE TABLE public.daily_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    task_type TEXT NOT NULL DEFAULT 'daily',
    requirement_type TEXT NOT NULL,
    requirement_value INTEGER NOT NULL DEFAULT 1,
    reward_beans INTEGER DEFAULT 0,
    reward_coins INTEGER DEFAULT 0,
    icon_name TEXT DEFAULT 'star',
    icon_color TEXT DEFAULT '#FFB800',
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- User Task Progress
CREATE TABLE public.user_task_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    task_id UUID REFERENCES public.daily_tasks(id) ON DELETE CASCADE NOT NULL,
    current_progress INTEGER DEFAULT 0,
    is_completed BOOLEAN DEFAULT false,
    is_claimed BOOLEAN DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    claimed_at TIMESTAMP WITH TIME ZONE,
    reset_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, task_id, reset_date)
);

-- Invitation Settings (Admin Controlled)
CREATE TABLE public.invitation_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_name TEXT NOT NULL,
    min_invites INTEGER NOT NULL DEFAULT 1,
    max_invites INTEGER,
    reward_beans INTEGER DEFAULT 0,
    reward_coins INTEGER DEFAULT 0,
    bonus_percentage INTEGER DEFAULT 0,
    badge_icon TEXT,
    badge_color TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- User Invitations Tracking
CREATE TABLE public.user_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inviter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    invited_user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    invitation_code TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    beans_earned INTEGER DEFAULT 0,
    coins_earned INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    verified_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(inviter_id, invited_user_id)
);

-- Enable RLS
ALTER TABLE public.daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_task_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for daily_tasks (public read, admin write)
CREATE POLICY "Anyone can view active tasks" 
ON public.daily_tasks FOR SELECT 
USING (is_active = true);

CREATE POLICY "Admins can manage tasks"
ON public.daily_tasks FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_task_progress
CREATE POLICY "Users can view own progress" 
ON public.user_task_progress FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress" 
ON public.user_task_progress FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress" 
ON public.user_task_progress FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

-- RLS Policies for invitation_settings (public read, admin write)
CREATE POLICY "Anyone can view active invitation settings" 
ON public.invitation_settings FOR SELECT 
USING (is_active = true);

CREATE POLICY "Admins can manage invitation settings"
ON public.invitation_settings FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_invitations
CREATE POLICY "Users can view own invitations" 
ON public.user_invitations FOR SELECT 
TO authenticated
USING (auth.uid() = inviter_id OR auth.uid() = invited_user_id);

CREATE POLICY "Users can create invitations" 
ON public.user_invitations FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = inviter_id);

CREATE POLICY "Users can update own invitations" 
ON public.user_invitations FOR UPDATE 
TO authenticated
USING (auth.uid() = inviter_id);

-- Insert default daily tasks
INSERT INTO public.daily_tasks (title, description, requirement_type, requirement_value, reward_beans, reward_coins, icon_name, icon_color, display_order)
VALUES 
    ('প্রথম লাইভ', 'আজ প্রথমবার লাইভে যান', 'first_live', 1, 50, 10, 'video', '#FF6B6B', 1),
    ('৩০ মিনিট লাইভ', '৩০ মিনিট লাইভ স্ট্রিম করুন', 'live_minutes', 30, 100, 20, 'clock', '#4ECDC4', 2),
    ('৫ জন ভিউয়ার', 'লাইভে ৫ জন ভিউয়ার পান', 'viewers', 5, 75, 15, 'users', '#45B7D1', 3),
    ('প্রথম গিফট', 'আজ প্রথম গিফট গ্রহণ করুন', 'first_gift', 1, 30, 5, 'gift', '#F7DC6F', 4),
    ('৫ জনকে মেসেজ', '৫ জনকে মেসেজ পাঠান', 'messages_sent', 5, 25, 5, 'message-circle', '#9B59B6', 5);

-- Insert default invitation tiers
INSERT INTO public.invitation_settings (tier_name, min_invites, max_invites, reward_beans, reward_coins, bonus_percentage, badge_color, display_order)
VALUES 
    ('Bronze', 1, 5, 100, 20, 0, '#CD7F32', 1),
    ('Silver', 6, 15, 300, 60, 5, '#C0C0C0', 2),
    ('Gold', 16, 30, 600, 120, 10, '#FFD700', 3),
    ('Platinum', 31, 50, 1000, 200, 15, '#E5E4E2', 4),
    ('Diamond', 51, NULL, 2000, 400, 25, '#B9F2FF', 5);