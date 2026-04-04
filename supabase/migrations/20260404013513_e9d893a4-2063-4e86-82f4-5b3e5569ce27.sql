CREATE TABLE IF NOT EXISTS public.stream_recordings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stream_id uuid,
    host_id uuid,
    host_uid text,
    host_name text,
    recording_url text,
    recording_sid text,
    resource_id text,
    channel_name text,
    duration_seconds integer DEFAULT 0,
    file_size_bytes bigint DEFAULT 0,
    status text DEFAULT 'recording'::text,
    started_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '15 days'::interval),
    thumbnail_url text,
    total_viewers integer DEFAULT 0,
    total_gifts integer DEFAULT 0,
    total_coins bigint DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT stream_recordings_status_check CHECK ((status = ANY (ARRAY['recording'::text, 'processing'::text, 'ready'::text, 'failed'::text, 'expired'::text, 'deleted'::text])))
);
ALTER TABLE public.stream_recordings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.stream_viewers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stream_id uuid NOT NULL,
    viewer_id uuid NOT NULL,
    joined_at timestamp with time zone DEFAULT now(),
    left_at timestamp with time zone
);
ALTER TABLE public.stream_viewers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.sub_agent_commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sub_agent_id uuid NOT NULL,
    host_id uuid NOT NULL,
    gift_transaction_id uuid,
    commission_amount numeric NOT NULL,
    commission_rate numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.sub_agent_commissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.sub_agent_referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sub_agent_id uuid NOT NULL,
    referred_host_id uuid NOT NULL,
    commission_earned numeric DEFAULT 0,
    status character varying(20) DEFAULT 'active'::character varying,
    referred_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.sub_agent_referrals ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.sub_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    user_id uuid NOT NULL,
    referrer_id uuid,
    referral_code character varying(20) NOT NULL,
    commission_rate numeric DEFAULT 2,
    total_referrals integer DEFAULT 0,
    total_earnings numeric DEFAULT 0,
    status character varying(20) DEFAULT 'active'::character varying,
    joined_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.sub_agents ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.subscription_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_number character varying(50) NOT NULL,
    plan_id uuid,
    plan_name character varying(100) NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying,
    customer_name character varying(200) NOT NULL,
    customer_email character varying(255) NOT NULL,
    customer_phone character varying(50),
    customer_country character varying(100) NOT NULL,
    payment_method_id uuid,
    payment_method_name character varying(100),
    transaction_id character varying(200),
    payment_proof_url text,
    status character varying(50) DEFAULT 'pending'::character varying,
    admin_notes text,
    processed_by uuid,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.subscription_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    currency text DEFAULT 'BDT'::text,
    duration_days integer DEFAULT 30,
    features jsonb DEFAULT '[]'::jsonb,
    is_popular boolean DEFAULT false,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.support_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    sender_id uuid,
    sender_type text DEFAULT 'user'::text NOT NULL,
    content text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attachment_url text,
    attachment_type text,
    translated_content text,
    original_language text,
    voice_transcript text
);
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_number text DEFAULT ('TKT-'::text || lpad((floor((random() * (1000000)::double precision)))::text, 6, '0'::text)) NOT NULL,
    user_id uuid NOT NULL,
    subject text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    assigned_to uuid,
    resolved_at timestamp with time zone,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_email text,
    sender_sector text DEFAULT 'user'::text
);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.system_error_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    error_type character varying(50) DEFAULT 'error'::character varying NOT NULL,
    error_message text NOT NULL,
    error_stack text,
    page_url text,
    page_path text,
    component_name text,
    user_id uuid,
    user_agent text,
    browser_info jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_resolved boolean DEFAULT false,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    resolution_notes text
);
ALTER TABLE public.system_error_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.topup_helpers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    is_active boolean DEFAULT true,
    is_verified boolean DEFAULT false,
    commission_rate numeric DEFAULT 5,
    buy_rate numeric DEFAULT 95,
    sell_rate numeric DEFAULT 105,
    total_bought bigint DEFAULT 0,
    total_sold bigint DEFAULT 0,
    total_earnings numeric DEFAULT 0,
    wallet_balance numeric DEFAULT 0,
    contact_info jsonb DEFAULT '{}'::jsonb,
    display_order integer DEFAULT 0,
    approved_at timestamp with time zone,
    approved_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    payment_credentials jsonb DEFAULT '{}'::jsonb,
    auto_receive_orders boolean DEFAULT true,
    order_notification_email text,
    order_notification_phone text,
    country_code text DEFAULT 'BD'::text,
    supported_countries text[] DEFAULT ARRAY['BD'::text],
    trader_level integer DEFAULT 1,
    payroll_enabled boolean DEFAULT false,
    total_level_upgrade_cost numeric DEFAULT 0,
    payroll_applied_at timestamp with time zone,
    payroll_status text,
    payroll_approved_at timestamp with time zone,
    payroll_approved_by uuid,
    CONSTRAINT topup_helpers_trader_level_check CHECK (((trader_level >= 1) AND (trader_level <= 5)))
);
ALTER TABLE public.topup_helpers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.trader_level_purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trader_id uuid NOT NULL,
    from_level integer NOT NULL,
    to_level integer NOT NULL,
    cost_usd numeric NOT NULL,
    payment_method text,
    payment_proof text,
    status text DEFAULT 'pending'::text,
    admin_notes text,
    approved_at timestamp with time zone,
    approved_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT trader_level_purchases_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);
ALTER TABLE public.trader_level_purchases ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.trader_level_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    level_number integer NOT NULL,
    level_name text NOT NULL,
    upgrade_cost_usd numeric DEFAULT 0 NOT NULL,
    min_withdrawal_amount numeric DEFAULT 5000,
    max_withdrawal_amount numeric DEFAULT 100000,
    commission_rate numeric DEFAULT 0,
    badge_color text DEFAULT '#666'::text,
    benefits jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.trader_level_tiers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_beans_exchange_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    beans_amount integer NOT NULL,
    diamonds_received integer NOT NULL,
    exchange_rate numeric NOT NULL,
    tier_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.user_beans_exchange_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_beans_exchange_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tier_name text NOT NULL,
    min_beans integer NOT NULL,
    max_beans integer,
    exchange_rate numeric NOT NULL,
    bonus_percent numeric DEFAULT 0,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.user_beans_exchange_tiers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blocker_id uuid NOT NULL,
    blocked_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_entry_banners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entry_banner_id uuid NOT NULL,
    purchased_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true
);
ALTER TABLE public.user_entry_banners ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inviter_id uuid NOT NULL,
    invitee_id uuid,
    invitation_code text NOT NULL,
    status text DEFAULT 'pending'::text,
    reward_claimed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_level_thresholds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    level integer NOT NULL,
    min_consumption bigint NOT NULL,
    badge_url text,
    badge_color text,
    privileges jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.user_level_thresholds ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_level_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    level_number integer NOT NULL,
    level_name text NOT NULL,
    min_consumption bigint DEFAULT 0 NOT NULL,
    max_consumption bigint,
    badge_url text,
    badge_color text DEFAULT '#666'::text,
    frame_url text,
    privileges jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.user_level_tiers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_login_streaks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    current_streak integer DEFAULT 0,
    longest_streak integer DEFAULT 0,
    last_login_date date,
    total_logins integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.user_login_streaks ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_parcels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    parcel_template_id uuid,
    parcel_type text DEFAULT 'standard'::text NOT NULL,
    coins_amount integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    claimed_at timestamp with time zone,
    expires_at timestamp with time zone,
    source text DEFAULT 'system'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.user_parcels ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_purchased_backgrounds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    background_id uuid NOT NULL,
    purchased_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true
);
ALTER TABLE public.user_purchased_backgrounds ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    item_id uuid NOT NULL,
    item_type text NOT NULL,
    price_paid integer NOT NULL,
    currency_type text DEFAULT 'coins'::text,
    purchased_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true
);
ALTER TABLE public.user_purchases ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reporter_id uuid NOT NULL,
    reported_id uuid NOT NULL,
    reason text NOT NULL,
    description text,
    evidence_urls text[],
    status text DEFAULT 'pending'::text,
    admin_notes text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_role_frames (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    frame_id uuid NOT NULL,
    equipped boolean DEFAULT false,
    purchased_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone
);
ALTER TABLE public.user_role_frames ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    auto_renew boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_task_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    task_id uuid NOT NULL,
    current_count integer DEFAULT 0,
    is_completed boolean DEFAULT false,
    completed_at timestamp with time zone,
    reward_claimed boolean DEFAULT false,
    task_date date DEFAULT CURRENT_DATE,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.user_task_progress ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_vip_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    vip_tier_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    is_active boolean DEFAULT true,
    auto_renew boolean DEFAULT false,
    payment_method text,
    amount_paid numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.user_vip_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.violation_penalty_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    violation_type text NOT NULL,
    occurrence_number integer NOT NULL,
    penalty_action text NOT NULL,
    penalty_duration_hours integer,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.violation_penalty_tiers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.vip_exclusive_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_type text NOT NULL,
    item_id uuid NOT NULL,
    min_vip_tier integer DEFAULT 1,
    discount_percent integer DEFAULT 0,
    is_free boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.vip_exclusive_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.vip_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tier_level integer NOT NULL,
    tier_name text NOT NULL,
    price_monthly numeric NOT NULL,
    price_yearly numeric,
    badge_url text,
    frame_url text,
    entrance_url text,
    benefits jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.vip_tiers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.vpn_detection_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    ip_address text NOT NULL,
    is_vpn boolean DEFAULT false,
    vpn_provider text,
    country_code text,
    city text,
    isp text,
    action_taken text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.vpn_detection_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.watchlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    content_id uuid NOT NULL,
    content_type text NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.welcome_bonuses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    bonus_type text NOT NULL,
    bonus_amount integer NOT NULL,
    claimed boolean DEFAULT false,
    claimed_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.welcome_bonuses ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.youtube_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel_name text NOT NULL,
    channel_url text NOT NULL,
    channel_id text,
    category text DEFAULT 'general'::text,
    is_active boolean DEFAULT true,
    auto_fetch boolean DEFAULT false,
    display_order integer DEFAULT 0,
    last_fetched_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.youtube_sources ENABLE ROW LEVEL SECURITY;