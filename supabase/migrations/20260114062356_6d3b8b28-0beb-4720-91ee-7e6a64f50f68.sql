-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table for admin access
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Add is_blocked to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

-- Add is_blocked to agencies
ALTER TABLE public.agencies
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

-- Create security definer function to check roles (prevents recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- RLS policies for user_roles table
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Create admin stats table for dashboard
CREATE TABLE public.admin_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
    total_users INTEGER DEFAULT 0,
    total_hosts INTEGER DEFAULT 0,
    total_agencies INTEGER DEFAULT 0,
    total_streams INTEGER DEFAULT 0,
    total_party_rooms INTEGER DEFAULT 0,
    total_coins_spent INTEGER DEFAULT 0,
    total_gifts_sent INTEGER DEFAULT 0,
    daily_active_users INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(stat_date)
);

ALTER TABLE public.admin_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view stats"
ON public.admin_stats
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

-- Create app_settings table for global configuration
CREATE TABLE public.app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key TEXT UNIQUE NOT NULL,
    setting_value JSONB NOT NULL DEFAULT '{}',
    description TEXT,
    category TEXT DEFAULT 'general',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read app settings"
ON public.app_settings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage app settings"
ON public.app_settings
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Insert default app settings
INSERT INTO public.app_settings (setting_key, setting_value, description, category) VALUES
('coin_packages', '[{"id": "1", "coins": 100, "price": 1.99, "bonus": 0}, {"id": "2", "coins": 500, "price": 4.99, "bonus": 50}, {"id": "3", "coins": 1000, "price": 9.99, "bonus": 150}]', 'Coin purchase packages', 'coins'),
('call_rates', '{"min_rate": 30, "max_rate": 500, "default_rate": 60}', 'Private call coin rates per minute', 'calls'),
('host_requirements', '{"min_age": 18, "gender": "female", "verification_required": true}', 'Requirements to become a host', 'hosts'),
('gift_categories', '["Popular", "Luxury", "Special", "Holiday"]', 'Gift categories', 'gifts'),
('party_room_limits', '{"max_video_participants": 4, "max_audio_participants": 12, "max_game_participants": 8}', 'Party room participant limits', 'party'),
('level_thresholds', '[10000, 30000, 100000, 300000, 1000000, 3000000, 10000000, 30000000, 100000000, 300000000]', 'Coin thresholds for user levels', 'levels'),
('maintenance_mode', '{"enabled": false, "message": "App is under maintenance"}', 'Maintenance mode settings', 'system')
ON CONFLICT (setting_key) DO NOTHING;

-- Create admin action logs
CREATE TABLE public.admin_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    target_type TEXT,
    target_id UUID,
    details JSONB DEFAULT '{}',
    ip_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view logs"
ON public.admin_logs
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can create logs"
ON public.admin_logs
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

-- Function to log admin actions
CREATE OR REPLACE FUNCTION public.log_admin_action(
    _action_type TEXT,
    _target_type TEXT DEFAULT NULL,
    _target_id UUID DEFAULT NULL,
    _details JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _log_id UUID;
BEGIN
    INSERT INTO public.admin_logs (admin_id, action_type, target_type, target_id, details)
    VALUES (auth.uid(), _action_type, _target_type, _target_id, _details)
    RETURNING id INTO _log_id;
    
    RETURN _log_id;
END;
$$;

-- Function to block/unblock user
CREATE OR REPLACE FUNCTION public.admin_block_user(_user_id UUID, _block BOOLEAN, _reason TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
    
    UPDATE public.profiles
    SET 
        is_blocked = _block,
        blocked_at = CASE WHEN _block THEN now() ELSE NULL END,
        blocked_reason = CASE WHEN _block THEN _reason ELSE NULL END
    WHERE id = _user_id;
    
    -- Log the action
    PERFORM public.log_admin_action(
        CASE WHEN _block THEN 'block_user' ELSE 'unblock_user' END,
        'user',
        _user_id,
        jsonb_build_object('reason', _reason)
    );
    
    RETURN TRUE;
END;
$$;

-- Function to block/unblock agency
CREATE OR REPLACE FUNCTION public.admin_block_agency(_agency_id UUID, _block BOOLEAN, _reason TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
    
    UPDATE public.agencies
    SET 
        is_blocked = _block,
        blocked_at = CASE WHEN _block THEN now() ELSE NULL END,
        blocked_reason = CASE WHEN _block THEN _reason ELSE NULL END,
        is_active = NOT _block
    WHERE id = _agency_id;
    
    -- Log the action
    PERFORM public.log_admin_action(
        CASE WHEN _block THEN 'block_agency' ELSE 'unblock_agency' END,
        'agency',
        _agency_id,
        jsonb_build_object('reason', _reason)
    );
    
    RETURN TRUE;
END;
$$;

-- Function to get admin dashboard stats
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _stats JSONB;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
    
    SELECT jsonb_build_object(
        'total_users', (SELECT COUNT(*) FROM profiles),
        'total_hosts', (SELECT COUNT(*) FROM profiles WHERE is_host = true),
        'total_agencies', (SELECT COUNT(*) FROM agencies WHERE is_active = true),
        'active_streams', (SELECT COUNT(*) FROM live_streams WHERE is_active = true),
        'active_party_rooms', (SELECT COUNT(*) FROM party_rooms WHERE is_active = true),
        'total_gifts_today', (SELECT COALESCE(SUM(coin_amount), 0) FROM gift_transactions WHERE created_at >= CURRENT_DATE),
        'total_calls_today', (SELECT COUNT(*) FROM private_calls WHERE created_at >= CURRENT_DATE),
        'online_users', (SELECT COUNT(*) FROM profiles WHERE is_online = true),
        'blocked_users', (SELECT COUNT(*) FROM profiles WHERE is_blocked = true),
        'blocked_agencies', (SELECT COUNT(*) FROM agencies WHERE is_blocked = true),
        'pending_host_applications', (SELECT COUNT(*) FROM profiles WHERE host_status = 'pending')
    ) INTO _stats;
    
    RETURN _stats;
END;
$$;

-- Trigger to update updated_at
CREATE TRIGGER update_user_roles_updated_at
    BEFORE UPDATE ON public.user_roles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_app_settings_updated_at
    BEFORE UPDATE ON public.app_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_admin_stats_updated_at
    BEFORE UPDATE ON public.admin_stats
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();