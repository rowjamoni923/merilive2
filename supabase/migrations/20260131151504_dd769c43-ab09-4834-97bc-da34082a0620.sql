-- =============================================
-- ADMIN ROLE & PERMISSION SYSTEM
-- Sector-based Sub-Admin Access Control
-- =============================================

-- 1. Create Admin Role Enum
CREATE TYPE public.admin_role AS ENUM ('owner', 'sub_admin');

-- 2. Admin Users Table (who can access admin panel)
CREATE TABLE public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT,
    role admin_role NOT NULL DEFAULT 'sub_admin',
    is_active BOOLEAN DEFAULT true,
    invited_by UUID REFERENCES auth.users(id),
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(email)
);

-- 3. Admin Sections (all available sections in admin panel)
CREATE TABLE public.admin_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_key TEXT NOT NULL UNIQUE,
    section_name TEXT NOT NULL,
    section_name_bn TEXT,
    description TEXT,
    icon_name TEXT,
    hub_key TEXT, -- Which hub this section belongs to
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. Admin Section Permissions (which sections a sub-admin can access)
CREATE TABLE public.admin_section_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID REFERENCES public.admin_users(id) ON DELETE CASCADE NOT NULL,
    section_id UUID REFERENCES public.admin_sections(id) ON DELETE CASCADE NOT NULL,
    can_view BOOLEAN DEFAULT true,
    can_edit BOOLEAN DEFAULT true,
    can_delete BOOLEAN DEFAULT false,
    granted_by UUID REFERENCES auth.users(id),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(admin_user_id, section_id)
);

-- 5. Admin Invitations (for email invites)
CREATE TABLE public.admin_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    display_name TEXT,
    role admin_role DEFAULT 'sub_admin',
    invited_by UUID REFERENCES auth.users(id) NOT NULL,
    token TEXT NOT NULL UNIQUE,
    sections_access UUID[] DEFAULT '{}', -- Array of section IDs
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days'),
    accepted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_section_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_invitations ENABLE ROW LEVEL SECURITY;

-- =============================================
-- SECURITY DEFINER FUNCTIONS
-- =============================================

-- Check if user is admin owner
CREATE OR REPLACE FUNCTION public.is_admin_owner(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE user_id = _user_id 
        AND role = 'owner'
        AND is_active = true
    )
$$;

-- Check if user is any admin (owner or sub_admin)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users
        WHERE user_id = _user_id 
        AND is_active = true
    )
$$;

-- Check if user has access to specific section
CREATE OR REPLACE FUNCTION public.has_section_access(_user_id UUID, _section_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        -- Owner has access to everything
        public.is_admin_owner(_user_id)
        OR
        -- Sub-admin has specific section access
        EXISTS (
            SELECT 1 
            FROM public.admin_users au
            JOIN public.admin_section_permissions asp ON asp.admin_user_id = au.id
            JOIN public.admin_sections s ON s.id = asp.section_id
            WHERE au.user_id = _user_id 
            AND au.is_active = true
            AND s.section_key = _section_key
            AND s.is_active = true
            AND asp.can_view = true
        )
$$;

-- Get admin role for user
CREATE OR REPLACE FUNCTION public.get_admin_role(_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role::TEXT FROM public.admin_users
    WHERE user_id = _user_id AND is_active = true
    LIMIT 1
$$;

-- Get all accessible sections for a user
CREATE OR REPLACE FUNCTION public.get_accessible_sections(_user_id UUID)
RETURNS TABLE(section_key TEXT, section_name TEXT, hub_key TEXT, can_edit BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- If owner, return all sections
    IF public.is_admin_owner(_user_id) THEN
        RETURN QUERY
        SELECT s.section_key, s.section_name, s.hub_key, true as can_edit
        FROM public.admin_sections s
        WHERE s.is_active = true
        ORDER BY s.display_order;
    ELSE
        -- Return only permitted sections
        RETURN QUERY
        SELECT s.section_key, s.section_name, s.hub_key, asp.can_edit
        FROM public.admin_users au
        JOIN public.admin_section_permissions asp ON asp.admin_user_id = au.id
        JOIN public.admin_sections s ON s.id = asp.section_id
        WHERE au.user_id = _user_id 
        AND au.is_active = true
        AND s.is_active = true
        AND asp.can_view = true
        ORDER BY s.display_order;
    END IF;
END;
$$;

-- =============================================
-- RLS POLICIES
-- =============================================

-- Admin Users policies
CREATE POLICY "Owners can manage all admin users"
ON public.admin_users FOR ALL
USING (public.is_admin_owner(auth.uid()))
WITH CHECK (public.is_admin_owner(auth.uid()));

CREATE POLICY "Admins can view own record"
ON public.admin_users FOR SELECT
USING (user_id = auth.uid());

-- Admin Sections policies
CREATE POLICY "Admins can view active sections"
ON public.admin_sections FOR SELECT
USING (public.is_admin(auth.uid()) AND is_active = true);

CREATE POLICY "Owners can manage sections"
ON public.admin_sections FOR ALL
USING (public.is_admin_owner(auth.uid()))
WITH CHECK (public.is_admin_owner(auth.uid()));

-- Admin Section Permissions policies
CREATE POLICY "Owners can manage permissions"
ON public.admin_section_permissions FOR ALL
USING (public.is_admin_owner(auth.uid()))
WITH CHECK (public.is_admin_owner(auth.uid()));

CREATE POLICY "Admins can view own permissions"
ON public.admin_section_permissions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.admin_users au
        WHERE au.id = admin_user_id AND au.user_id = auth.uid()
    )
);

-- Admin Invitations policies
CREATE POLICY "Owners can manage invitations"
ON public.admin_invitations FOR ALL
USING (public.is_admin_owner(auth.uid()))
WITH CHECK (public.is_admin_owner(auth.uid()));

-- =============================================
-- INSERT DEFAULT SECTIONS (All 12 Hubs)
-- =============================================

INSERT INTO public.admin_sections (section_key, section_name, section_name_bn, hub_key, icon_name, display_order) VALUES
-- User Hub
('user-management', 'User Management', 'ইউজার ম্যানেজমেন্ট', 'user-hub', 'Users', 1),
('live-bans', 'Live Bans', 'লাইভ ব্যান', 'user-hub', 'Ban', 2),

-- Agency Hub
('agency-management', 'Agency Management', 'এজেন্সি ম্যানেজমেন্ট', 'agency-hub', 'Building', 10),
('host-management', 'Host Management', 'হোস্ট ম্যানেজমেন্ট', 'agency-hub', 'UserCheck', 11),
('host-applications', 'Host Applications', 'হোস্ট আবেদন', 'agency-hub', 'FileCheck', 12),
('face-verification', 'Face Verification', 'ফেস ভেরিফিকেশন', 'agency-hub', 'ScanFace', 13),

-- Level Management
('level-tiers', 'Level Tiers', 'লেভেল টায়ার', 'level-hub', 'TrendingUp', 20),
('level-privileges', 'Level Privileges', 'লেভেল প্রিভিলেজ', 'level-hub', 'Award', 21),
('feature-levels', 'Feature Levels', 'ফিচার লেভেল', 'level-hub', 'Settings', 22),

-- VIP Management
('vip-medals', 'VIP Medals', 'ভিআইপি মেডেল', 'vip-hub', 'Medal', 30),
('vip-privileges', 'VIP Privileges', 'ভিআইপি প্রিভিলেজ', 'vip-hub', 'Crown', 31),
('noble-cards', 'Noble Cards', 'নোবেল কার্ড', 'vip-hub', 'CreditCard', 32),

-- Visual Assets Hub
('avatar-frames', 'Avatar Frames', 'অ্যাভাটার ফ্রেম', 'visual-hub', 'Frame', 40),
('entry-effects', 'Entry Effects', 'এন্ট্রি ইফেক্ট', 'visual-hub', 'Sparkles', 41),
('chat-bubbles', 'Chat Bubbles', 'চ্যাট বাবল', 'visual-hub', 'MessageCircle', 42),
('vehicle-entrances', 'Vehicle Entrances', 'গাড়ি এন্ট্রান্স', 'visual-hub', 'Car', 43),

-- Coin Trader Hub
('coin-traders', 'Coin Traders', 'কয়েন ট্রেডার', 'trader-hub', 'Coins', 50),
('trader-orders', 'Trader Orders', 'ট্রেডার অর্ডার', 'trader-hub', 'ShoppingCart', 51),
('trader-transactions', 'Transactions', 'লেনদেন', 'trader-hub', 'ArrowLeftRight', 52),

-- Finance Hub
('topup-system', 'Topup System', 'টপআপ সিস্টেম', 'finance-hub', 'CreditCard', 60),
('withdrawals', 'Withdrawals', 'উইথড্র', 'finance-hub', 'Wallet', 61),
('manual-topup', 'Manual Topup', 'ম্যানুয়াল টপআপ', 'finance-hub', 'HandCoins', 62),
('payment-gateways', 'Payment Gateways', 'পেমেন্ট গেটওয়ে', 'finance-hub', 'Landmark', 63),
('transfer-history', 'Transfer History', 'ট্রান্সফার হিস্ট্রি', 'finance-hub', 'History', 64),

-- Game Hub
('game-settings', 'Game Settings', 'গেম সেটিংস', 'game-hub', 'Gamepad', 70),
('game-providers', 'Game Providers', 'গেম প্রোভাইডার', 'game-hub', 'Server', 71),

-- Party Hub
('party-rooms', 'Party Rooms', 'পার্টি রুম', 'party-hub', 'PartyPopper', 80),
('party-backgrounds', 'Backgrounds', 'ব্যাকগ্রাউন্ড', 'party-hub', 'Image', 81),
('party-banners', 'Party Banners', 'পার্টি ব্যানার', 'party-hub', 'Flag', 82),

-- Content Hub
('banners', 'Banners', 'ব্যানার', 'content-hub', 'Image', 90),
('reels', 'Reels', 'রিলস', 'content-hub', 'Film', 91),
('recordings', 'Recordings', 'রেকর্ডিং', 'content-hub', 'Video', 92),
('streams', 'Streams', 'স্ট্রিম', 'content-hub', 'Radio', 93),

-- Shop Hub
('gifts', 'Gifts', 'গিফট', 'shop-hub', 'Gift', 100),
('coins', 'Coin Packages', 'কয়েন প্যাকেজ', 'shop-hub', 'Coins', 101),
('animation-store', 'Animation Store', 'অ্যানিমেশন স্টোর', 'shop-hub', 'Wand', 102),

-- App Settings Hub
('app-version', 'App Version', 'অ্যাপ ভার্সন', 'settings-hub', 'Smartphone', 110),
('branding', 'Branding', 'ব্র্যান্ডিং', 'settings-hub', 'Palette', 111),
('notifications', 'Notifications', 'নোটিফিকেশন', 'settings-hub', 'Bell', 112),
('app-settings', 'App Settings', 'অ্যাপ সেটিংস', 'settings-hub', 'Settings', 113),

-- Moderation & Support
('reports', 'Reports', 'রিপোর্ট', 'moderation-hub', 'Flag', 120),
('support-tickets', 'Support Tickets', 'সাপোর্ট টিকেট', 'moderation-hub', 'Headphones', 121),
('admin-logs', 'Admin Logs', 'অ্যাডমিন লগ', 'moderation-hub', 'FileText', 122);

-- =============================================
-- UPDATE TRIGGER
-- =============================================

CREATE OR REPLACE FUNCTION public.update_admin_users_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_admin_users_updated_at
BEFORE UPDATE ON public.admin_users
FOR EACH ROW EXECUTE FUNCTION public.update_admin_users_timestamp();