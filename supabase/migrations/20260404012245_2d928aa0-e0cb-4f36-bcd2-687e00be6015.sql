CREATE TYPE public.admin_device_status AS ENUM (
    'pending',
    'approved',
    'blocked'
);

CREATE TYPE public.admin_role AS ENUM (
    'owner',
    'sub_admin'
);

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'moderator',
    'user'
);

CREATE TABLE public.admin_notices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    target_audience text[] DEFAULT ARRAY['all'::text] NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    read_by uuid[] DEFAULT ARRAY[]::uuid[],
    image_url text
);

CREATE TABLE public.account_lockouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identifier text NOT NULL,
    locked_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_until timestamp with time zone NOT NULL,
    failed_attempts integer DEFAULT 0,
    reason text DEFAULT 'brute_force'::text
);

CREATE TABLE public.admin_allowed_devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_user_id uuid NOT NULL,
    device_fingerprint text NOT NULL,
    device_name text,
    device_info jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    user_agent text,
    status public.admin_device_status DEFAULT 'pending'::public.admin_device_status,
    approved_by uuid,
    approved_at timestamp with time zone,
    last_used_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    notes text
);

CREATE TABLE public.admin_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    display_name text,
    role public.admin_role DEFAULT 'sub_admin'::public.admin_role,
    invited_by uuid NOT NULL,
    token text NOT NULL,
    sections_access uuid[] DEFAULT '{}'::uuid[],
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval),
    accepted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.admin_login_otps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    otp_code text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    is_used boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.admin_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid,
    action_type text NOT NULL,
    target_type text,
    target_id text,
    details jsonb DEFAULT '{}'::jsonb,
    ip_address text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.admin_music_library (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    artist text NOT NULL,
    audio_url text NOT NULL,
    cover_image_url text,
    duration_seconds integer DEFAULT 0,
    genre text,
    category text DEFAULT 'music'::text,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.admin_section_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_user_id uuid NOT NULL,
    section_id uuid NOT NULL,
    can_view boolean DEFAULT true,
    can_edit boolean DEFAULT true,
    can_delete boolean DEFAULT false,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.admin_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_key text NOT NULL,
    section_name text NOT NULL,
    section_name_bn text,
    description text,
    icon_name text,
    hub_key text,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.admin_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stat_date text DEFAULT CURRENT_DATE NOT NULL,
    total_users integer DEFAULT 0,
    total_hosts integer DEFAULT 0,
    total_agencies integer DEFAULT 0,
    total_streams integer DEFAULT 0,
    total_party_rooms integer DEFAULT 0,
    total_coins_spent integer DEFAULT 0,
    total_gifts_sent integer DEFAULT 0,
    daily_active_users integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.admin_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    email text NOT NULL,
    display_name text,
    role public.admin_role DEFAULT 'sub_admin'::public.admin_role NOT NULL,
    is_active boolean DEFAULT true,
    invited_by uuid,
    invited_at timestamp with time zone DEFAULT now(),
    accepted_at timestamp with time zone,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    whatsapp_number text
);

CREATE TABLE public.agencies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid,
    name text NOT NULL,
    agency_code text NOT NULL,
    level text DEFAULT 'A1'::text,
    total_hosts integer DEFAULT 0,
    total_agents integer DEFAULT 0,
    wallet_balance integer DEFAULT 0,
    commission_rate numeric(5,2) DEFAULT 4.00,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_blocked boolean DEFAULT false,
    blocked_at timestamp with time zone,
    blocked_reason text,
    logo_url text,
    diamond_balance bigint DEFAULT 0 NOT NULL,
    beans_balance integer DEFAULT 0,
    parent_agency_id uuid,
    email text,
    whatsapp_number text
);

CREATE TABLE public.agency_commission_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    host_id uuid NOT NULL,
    transaction_type text DEFAULT 'gift'::text NOT NULL,
    original_amount numeric DEFAULT 0 NOT NULL,
    commission_rate numeric DEFAULT 2 NOT NULL,
    commission_amount numeric DEFAULT 0 NOT NULL,
    source_transaction_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text
);

CREATE TABLE public.agency_diamond_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    transaction_type character varying(20) NOT NULL,
    beans_amount bigint DEFAULT 0 NOT NULL,
    diamond_amount bigint DEFAULT 0 NOT NULL,
    fee_amount bigint DEFAULT 0 NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.agency_earnings_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    host_id uuid NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    transfer_type text DEFAULT 'weekly'::text NOT NULL,
    period_start timestamp with time zone,
    period_end timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    gift_earnings numeric DEFAULT 0,
    call_earnings numeric DEFAULT 0,
    host_uid text,
    host_name text,
    agency_name text,
    commission_rate numeric DEFAULT 0,
    notes text
);

CREATE TABLE public.agency_hosts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    host_id uuid NOT NULL,
    joined_via text DEFAULT 'invitation'::text,
    referral_code text,
    status text DEFAULT 'active'::text,
    joined_at timestamp with time zone DEFAULT now(),
    left_at timestamp with time zone
);

CREATE TABLE public.agency_level_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    level_code character varying(10) NOT NULL,
    level_name character varying(50) NOT NULL,
    min_weekly_income bigint DEFAULT 0 NOT NULL,
    max_weekly_income bigint DEFAULT 999999999 NOT NULL,
    commission_rate numeric(5,2) DEFAULT 2.0 NOT NULL,
    badge_color character varying(50) DEFAULT 'bronze'::character varying,
    display_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.agency_performance (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    period_type text NOT NULL,
    period_start date NOT NULL,
    total_income numeric(15,2) DEFAULT 0,
    new_hosts_count integer DEFAULT 0,
    total_host_hours numeric(10,2) DEFAULT 0,
    golden_host_income numeric(15,2) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.agency_policy_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_key text NOT NULL,
    section_title text NOT NULL,
    content jsonb DEFAULT '{}'::jsonb NOT NULL,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.agency_rankings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    ranking_type text NOT NULL,
    period_type text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    rank_position integer NOT NULL,
    metric_value numeric(15,2) DEFAULT 0,
    country_code text,
    country_flag text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.agency_withdrawals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_id uuid NOT NULL,
    amount numeric NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    payment_method text,
    payment_details jsonb,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    processed_by uuid,
    notes text,
    payment_method_type text,
    usd_amount numeric,
    exchange_rate numeric
);

CREATE TABLE public.allowed_external_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    url text NOT NULL,
    label text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true
);

CREATE TABLE public.app_content (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    is_published boolean DEFAULT false,
    language text DEFAULT 'en'::text,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.app_event_themes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    theme_name text NOT NULL,
    event_type text NOT NULL,
    splash_image_url text,
    login_bg_url text,
    home_banner_url text,
    icon_set jsonb DEFAULT '{}'::jsonb,
    color_scheme jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT false,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.app_icon_registry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    icon_key text NOT NULL,
    icon_label text NOT NULL,
    description text,
    current_url text,
    default_url text,
    category text DEFAULT 'general'::text,
    platform text DEFAULT 'all'::text,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.app_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    setting_key text NOT NULL,
    setting_value text,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.app_version_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform text NOT NULL,
    current_version text NOT NULL,
    minimum_version text NOT NULL,
    force_update boolean DEFAULT false,
    update_url text,
    changelog text,
    is_maintenance boolean DEFAULT false,
    maintenance_message text,
    maintenance_end_time timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.ar_stickers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    preview_url text,
    file_url text NOT NULL,
    category text DEFAULT 'fun'::text,
    is_free boolean DEFAULT true,
    coin_price integer DEFAULT 0,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.avatar_frames (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    image_url text NOT NULL,
    animation_url text,
    level_required integer DEFAULT 0,
    price_coins integer DEFAULT 0,
    price_diamonds integer DEFAULT 0,
    is_premium boolean DEFAULT false,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    category text DEFAULT 'general'::text,
    is_free boolean DEFAULT false
);

CREATE TABLE public.banned_devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    device_id text NOT NULL,
    user_id uuid,
    reason text,
    banned_at timestamp with time zone DEFAULT now() NOT NULL,
    banned_by uuid,
    is_active boolean DEFAULT true
);

CREATE TABLE public.banners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    image_url text NOT NULL,
    link_url text,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    location text DEFAULT 'home'::text,
    banner_type text DEFAULT 'image'::text,
    click_action text DEFAULT 'link'::text,
    target_data jsonb
);

CREATE TABLE public.beauty_filters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    preview_url text,
    file_url text NOT NULL,
    category text DEFAULT 'beauty'::text,
    is_free boolean DEFAULT true,
    coin_price integer DEFAULT 0,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    intensity_default real DEFAULT 0.5,
    filter_type text DEFAULT 'lookup'::text
);

CREATE TABLE public.blocked_ips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ip_address text NOT NULL,
    reason text,
    blocked_by uuid,
    blocked_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true
);

CREATE TABLE public.branding_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    setting_key text NOT NULL,
    setting_value text,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.call_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    caller_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    call_type text DEFAULT 'video'::text,
    status text DEFAULT 'initiated'::text,
    started_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone,
    duration integer DEFAULT 0,
    coin_cost integer DEFAULT 0
);

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    icon_url text,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    logo_url text,
    stream_url text,
    category_id uuid,
    is_live boolean DEFAULT false,
    viewer_count integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.chat_moderation_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid,
    user_id uuid NOT NULL,
    violation_type text NOT NULL,
    original_content text,
    action_taken text NOT NULL,
    detected_at timestamp with time zone DEFAULT now(),
    reviewed_by uuid,
    reviewed_at timestamp with time zone
);

CREATE TABLE public.coin_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    coins_amount integer NOT NULL,
    price_usd numeric(10,2) NOT NULL,
    bonus_coins integer DEFAULT 0,
    discount_percent integer DEFAULT 0,
    is_popular boolean DEFAULT false,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    icon_url text,
    description text,
    product_id text
);

CREATE TABLE public.coin_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    amount integer NOT NULL,
    transfer_type text DEFAULT 'gift'::text,
    created_at timestamp with time zone DEFAULT now(),
    notes text
);

CREATE TABLE public.consumption_return_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    min_consumption integer DEFAULT 0 NOT NULL,
    max_consumption integer,
    return_percentage numeric(5,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.consumption_return_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    consumption_amount integer NOT NULL,
    return_amount integer NOT NULL,
    return_percentage numeric(5,2) NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.content_audio_tracks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    artist text,
    audio_url text NOT NULL,
    duration_seconds integer DEFAULT 0,
    category text DEFAULT 'general'::text,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.content_subtitles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content_id uuid NOT NULL,
    language_code text DEFAULT 'en'::text NOT NULL,
    subtitle_url text NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.conversation_encryption_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    encrypted_key text NOT NULL,
    key_version integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone
);

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    participant1_id uuid NOT NULL,
    participant2_id uuid NOT NULL,
    last_message text,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_encrypted boolean DEFAULT false
);

CREATE TABLE public.currency_rates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    currency_code text NOT NULL,
    rate_to_usd numeric(15,6) NOT NULL,
    country_name text,
    country_flag text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.daily_login_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    reward_id uuid NOT NULL,
    day_number integer NOT NULL,
    reward_type text NOT NULL,
    reward_amount integer NOT NULL,
    claimed_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.daily_login_rewards_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    day_number integer NOT NULL,
    reward_type text NOT NULL,
    reward_amount integer NOT NULL,
    icon_url text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.daily_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    task_type text NOT NULL,
    reward_coins integer DEFAULT 0,
    reward_xp integer DEFAULT 0,
    required_count integer DEFAULT 1,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    target_gender text DEFAULT 'all'::text,
    icon_name text DEFAULT 'gift'::text,
    min_level integer DEFAULT 0
);

CREATE TABLE public.device_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    platform text DEFAULT 'android'::text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.email_otps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    otp_code text NOT NULL,
    purpose text DEFAULT 'login'::text,
    expires_at timestamp with time zone NOT NULL,
    is_used boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.entertainment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    type text NOT NULL,
    content_url text NOT NULL,
    thumbnail_url text,
    category_id uuid,
    view_count integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.entry_banners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    image_url text NOT NULL,
    animation_url text,
    level_required integer DEFAULT 0,
    price_coins integer DEFAULT 0,
    price_diamonds integer DEFAULT 0,
    is_premium boolean DEFAULT false,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    duration integer DEFAULT 3,
    sound_url text
);

CREATE TABLE public.entry_name_bars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    image_url text NOT NULL,
    animation_url text,
    level_required integer DEFAULT 0,
    price_coins integer DEFAULT 0,
    price_diamonds integer DEFAULT 0,
    is_premium boolean DEFAULT false,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.face_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    face_image_url text NOT NULL,
    face_data jsonb DEFAULT '{}'::jsonb,
    is_verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.face_verification_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    selfie_url text NOT NULL,
    status text DEFAULT 'pending'::text,
    confidence_score numeric,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    reference_image_url text,
    ai_analysis jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.failed_login_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identifier text NOT NULL,
    ip_address text,
    user_agent text,
    attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    attempt_type text DEFAULT 'password'::text
);

CREATE TABLE public.feature_level_requirements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    feature_key text NOT NULL,
    min_level integer DEFAULT 0,
    min_vip_level integer DEFAULT 0,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.first_recharge_bonus (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bonus_coins integer DEFAULT 0 NOT NULL,
    bonus_percentage numeric(5,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.first_recharge_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    bonus_id uuid NOT NULL,
    original_amount integer NOT NULL,
    bonus_amount integer NOT NULL,
    claimed_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.followers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    follower_id uuid NOT NULL,
    following_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.game_bets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id uuid NOT NULL,
    player_id uuid NOT NULL,
    bet_amount integer NOT NULL,
    bet_type text NOT NULL,
    bet_value text,
    result text DEFAULT 'pending'::text,
    payout integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.game_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_type text NOT NULL,
    config_key text NOT NULL,
    config_value jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.game_players (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id uuid NOT NULL,
    user_id uuid NOT NULL,
    seat_number integer,
    score integer DEFAULT 0,
    status text DEFAULT 'active'::text,
    joined_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.game_provider_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    event_type text NOT NULL,
    request_data jsonb DEFAULT '{}'::jsonb,
    response_data jsonb DEFAULT '{}'::jsonb,
    status_code integer,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.game_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    api_url text NOT NULL,
    api_key_ref text,
    logo_url text,
    supported_games text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true,
    config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.game_server_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    server_name text NOT NULL,
    server_url text NOT NULL,
    server_region text DEFAULT 'auto'::text,
    is_active boolean DEFAULT true,
    max_connections integer DEFAULT 1000,
    connection_timeout integer DEFAULT 30,
    heartbeat_interval integer DEFAULT 15,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.game_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid NOT NULL,
    game_type text NOT NULL,
    status text DEFAULT 'waiting'::text,
    max_players integer DEFAULT 8,
    current_round integer DEFAULT 0,
    game_data jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone,
    created_by uuid
);

CREATE TABLE public.game_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_type text NOT NULL,
    setting_key text NOT NULL,
    setting_value jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.game_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    game_type text NOT NULL,
    total_games integer DEFAULT 0,
    total_wins integer DEFAULT 0,
    total_coins_won integer DEFAULT 0,
    total_coins_lost integer DEFAULT 0,
    highest_score integer DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.game_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    game_session_id uuid,
    game_type text NOT NULL,
    transaction_type text NOT NULL,
    amount integer NOT NULL,
    balance_before integer DEFAULT 0,
    balance_after integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.gift_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    icon_url text,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.gift_transaction_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id uuid NOT NULL,
    gift_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    quantity integer DEFAULT 1,
    total_coins integer NOT NULL,
    room_id uuid,
    stream_id uuid,
    transaction_type text DEFAULT 'gift'::text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.gift_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gift_id uuid,
    sender_id uuid,
    receiver_id uuid,
    stream_id uuid,
    coin_amount integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    quantity integer DEFAULT 1,
    receiver_beans integer DEFAULT 0,
    room_id uuid
);

CREATE TABLE public.gifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    coin_value integer NOT NULL,
    icon_url text,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    animation_url text,
    animation_type text DEFAULT 'emoji'::text,
    category text DEFAULT 'popular'::text,
    svga_url text,
    category_id uuid,
    is_full_screen boolean DEFAULT false,
    receiver_beans integer DEFAULT 0
);

CREATE TABLE public.group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text,
    joined_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.group_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    message_type text DEFAULT 'text'::text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    avatar_url text,
    created_by uuid NOT NULL,
    max_members integer DEFAULT 100,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.helper_admin_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    helper_id uuid NOT NULL,
    sender_type text DEFAULT 'admin'::text NOT NULL,
    sender_id uuid,
    message text NOT NULL,
    message_type text DEFAULT 'text'::text,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.helper_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    whatsapp_number text NOT NULL,
    country_code text NOT NULL,
    status text DEFAULT 'pending'::text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.helper_assigned_countries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    helper_id uuid NOT NULL,
    country_code text NOT NULL,
    country_name text NOT NULL,
    is_active boolean DEFAULT true,
    assigned_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.helper_country_payment_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_code text NOT NULL,
    country_name text NOT NULL,
    payment_method_name text NOT NULL,
    payment_type text DEFAULT 'mobile_money'::text,
    instructions text,
    icon_url text,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.helper_diamond_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    diamond_amount integer NOT NULL,
    price_usd numeric(10,2) NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    local_prices jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.helper_level_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    level integer NOT NULL,
    level_name text NOT NULL,
    min_total_diamonds integer DEFAULT 0 NOT NULL,
    commission_rate numeric(5,2) DEFAULT 2.0 NOT NULL,
    badge_color text DEFAULT 'bronze'::text,
    badge_icon text,
    perks jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.helper_message_replies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    message_id uuid NOT NULL,
    sender_type text NOT NULL,
    sender_id uuid,
    reply_text text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.helper_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    helper_id uuid NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    type text DEFAULT 'info'::text NOT NULL,
    is_read boolean DEFAULT false,
    data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.helper_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    helper_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    package_id uuid NOT NULL,
    diamond_amount integer NOT NULL,
    total_price_usd numeric(10,2) NOT NULL,
    local_price numeric(15,2),
    local_currency text,
    payment_method text,
    payment_proof_url text,
    status text DEFAULT 'pending'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    commission_amount numeric(10,2) DEFAULT 0,
    commission_rate numeric(5,2) DEFAULT 0,
    processing_time_minutes integer
);

CREATE TABLE public.helper_payment_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    helper_id uuid NOT NULL,
    method_type text NOT NULL,
    account_name text NOT NULL,
    account_number text NOT NULL,
    additional_info jsonb DEFAULT '{}'::jsonb,
    is_primary boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.helper_topup_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    helper_id uuid NOT NULL,
    amount integer NOT NULL,
    status text DEFAULT 'pending'::text,
    payment_proof_url text,
    payment_method text,
    admin_notes text,
    processed_by uuid,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.helper_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    helper_id uuid NOT NULL,
    transaction_type text NOT NULL,
    amount integer NOT NULL,
    balance_before integer DEFAULT 0,
    balance_after integer DEFAULT 0,
    reference_id uuid,
    description text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.helper_upgrade_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    helper_id uuid NOT NULL,
    current_level integer DEFAULT 1,
    requested_level integer NOT NULL,
    status text DEFAULT 'pending'::text,
    admin_notes text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.helper_withdrawal_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    helper_id uuid NOT NULL,
    amount integer NOT NULL,
    payment_method_id uuid,
    status text DEFAULT 'pending'::text,
    admin_notes text,
    processed_by uuid,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.host_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    real_name text NOT NULL,
    age integer NOT NULL,
    language text[] DEFAULT '{}'::text[],
    country text,
    photo_url text,
    video_url text,
    status text DEFAULT 'pending'::text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    host_photos text[] DEFAULT '{}'::text[],
    ai_analysis jsonb DEFAULT '{}'::jsonb,
    face_verification_id uuid
);

CREATE TABLE public.host_contact_violations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    stream_id uuid,
    room_id uuid,
    violation_type text NOT NULL,
    detected_content text,
    severity text DEFAULT 'warning'::text,
    action_taken text DEFAULT 'warned'::text,
    created_at timestamp with time zone DEFAULT now(),
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    is_false_positive boolean DEFAULT false
);

CREATE TABLE public.host_conversion_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_id uuid NOT NULL,
    beans_amount integer NOT NULL,
    diamond_amount integer NOT NULL,
    conversion_rate numeric(10,4) NOT NULL,
    status text DEFAULT 'pending'::text,
    processed_by uuid,
    processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    notes text
);

CREATE TABLE public.host_levels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    level_number integer NOT NULL,
    level_name text NOT NULL,
    min_beans integer DEFAULT 0 NOT NULL,
    badge_url text,
    perks jsonb DEFAULT '[]'::jsonb,
    color text DEFAULT '#FFD700'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.invitation_reward_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invitation_id uuid NOT NULL,
    reward_type text NOT NULL,
    reward_amount integer NOT NULL,
    claimed_by uuid NOT NULL,
    claimed_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.invitation_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    setting_key text NOT NULL,
    setting_value jsonb DEFAULT '{}'::jsonb,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.iptv_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    category text DEFAULT 'general'::text,
    country text,
    language text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.kids_content (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    content_url text NOT NULL,
    thumbnail_url text,
    content_type text DEFAULT 'video'::text,
    age_range text DEFAULT '3-12'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.landing_page_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    section_key text NOT NULL,
    title text NOT NULL,
    subtitle text,
    content jsonb DEFAULT '{}'::jsonb,
    media_url text,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.leaderboard_podium_frames (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rank_position integer NOT NULL,
    leaderboard_type text NOT NULL,
    frame_image_url text NOT NULL,
    animation_url text,
    badge_url text,
    glow_color text DEFAULT '#FFD700'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.leaderboard_reward_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    leaderboard_type text NOT NULL,
    rank_position integer NOT NULL,
    reward_type text DEFAULT 'coins'::text NOT NULL,
    reward_amount integer DEFAULT 0 NOT NULL,
    badge_url text,
    title text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.leaderboard_reward_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    leaderboard_type text NOT NULL,
    rank_position integer NOT NULL,
    reward_type text NOT NULL,
    reward_amount integer NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    claimed_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.level_animations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    level integer NOT NULL,
    animation_url text NOT NULL,
    sound_url text,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.level_privileges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    level integer NOT NULL,
    privilege_name text NOT NULL,
    privilege_key text NOT NULL,
    description text,
    icon_url text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.limited_offer_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    offer_id uuid NOT NULL,
    amount_paid numeric(10,2) NOT NULL,
    coins_received integer NOT NULL,
    claimed_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.limited_time_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    coins_amount integer NOT NULL,
    original_price numeric(10,2) NOT NULL,
    offer_price numeric(10,2) NOT NULL,
    discount_percent integer DEFAULT 0,
    max_claims integer DEFAULT 1,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    is_active boolean DEFAULT true,
    icon_url text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.live_bans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    banned_by uuid NOT NULL,
    reason text NOT NULL,
    ban_type text DEFAULT 'permanent'::text,
    ban_duration_hours integer,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true,
    stream_id uuid,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.live_face_violations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stream_id uuid NOT NULL,
    host_id uuid NOT NULL,
    violation_type text NOT NULL,
    frame_url text,
    confidence numeric(5,2),
    action_taken text DEFAULT 'warning'::text,
    created_at timestamp with time zone DEFAULT now(),
    reviewed_by uuid,
    reviewed_at timestamp with time zone
);

CREATE TABLE public.live_game_bets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    round_id uuid NOT NULL,
    user_id uuid NOT NULL,
    bet_choice text NOT NULL,
    bet_amount integer NOT NULL,
    won boolean,
    payout integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.live_game_rounds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stream_id uuid NOT NULL,
    game_type text NOT NULL,
    round_number integer DEFAULT 1,
    status text DEFAULT 'betting'::text,
    result text,
    started_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone,
    total_pool integer DEFAULT 0,
    created_by uuid
);

CREATE TABLE public.live_moderation_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    setting_key text NOT NULL,
    setting_value jsonb DEFAULT '{}'::jsonb NOT NULL,
    description text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.live_streams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_id uuid NOT NULL,
    title text,
    status text DEFAULT 'active'::text,
    viewer_count integer DEFAULT 0,
    total_gifts integer DEFAULT 0,
    started_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone,
    thumbnail_url text,
    stream_type text DEFAULT 'live'::text,
    room_id text,
    is_active boolean DEFAULT true
);

CREATE TABLE public.live_violations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stream_id uuid NOT NULL,
    user_id uuid NOT NULL,
    violation_type text NOT NULL,
    severity text DEFAULT 'warning'::text,
    evidence_url text,
    action_taken text DEFAULT 'warning'::text,
    created_at timestamp with time zone DEFAULT now(),
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    notes text
);

CREATE TABLE public.login_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identifier text NOT NULL,
    ip_address text,
    user_agent text,
    success boolean DEFAULT false,
    failure_reason text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    content text NOT NULL,
    message_type text DEFAULT 'text'::text,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    is_encrypted boolean DEFAULT false,
    media_url text,
    reply_to_id uuid,
    is_deleted boolean DEFAULT false
);

CREATE TABLE public.movies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    poster_url text,
    video_url text NOT NULL,
    genre text,
    duration integer DEFAULT 0,
    year integer,
    rating numeric(3,1) DEFAULT 0,
    view_count integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.music (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    artist text,
    album text,
    cover_url text,
    audio_url text NOT NULL,
    duration integer DEFAULT 0,
    genre text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.new_host_live_bonus_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_id uuid NOT NULL,
    day_number integer NOT NULL,
    target_minutes integer NOT NULL,
    actual_minutes integer DEFAULT 0,
    bonus_amount integer NOT NULL,
    is_completed boolean DEFAULT false,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.new_host_live_bonus_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    day_number integer NOT NULL,
    target_minutes integer NOT NULL,
    bonus_amount integer NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.news (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    content text,
    source text,
    image_url text,
    category text DEFAULT 'general'::text,
    is_active boolean DEFAULT true,
    published_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.news_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    category text DEFAULT 'general'::text,
    country text,
    language text DEFAULT 'en'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.notification_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_key text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    icon_url text,
    action_type text,
    action_data jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    data jsonb,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.parcel_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parcel_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reward_type text NOT NULL,
    reward_amount integer NOT NULL,
    claimed_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.parcel_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    icon_url text,
    reward_type text NOT NULL,
    min_reward integer NOT NULL,
    max_reward integer NOT NULL,
    coin_cost integer DEFAULT 0,
    is_premium boolean DEFAULT false,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.party_room_backgrounds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    image_url text NOT NULL,
    thumbnail_url text,
    category text DEFAULT 'free'::text,
    price_coins integer DEFAULT 0,
    is_free boolean DEFAULT true,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.party_room_banners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    image_url text NOT NULL,
    link_url text,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.party_room_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    message_type text DEFAULT 'text'::text,
    created_at timestamp with time zone DEFAULT now(),
    is_deleted boolean DEFAULT false,
    gift_data jsonb
);

CREATE TABLE public.party_room_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'listener'::text,
    seat_number integer,
    is_muted boolean DEFAULT false,
    joined_at timestamp with time zone DEFAULT now(),
    left_at timestamp with time zone
);

CREATE TABLE public.party_rooms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    room_type text DEFAULT 'voice'::text,
    max_participants integer DEFAULT 10,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone,
    background_url text,
    password text,
    total_seats integer DEFAULT 8,
    country_code text,
    room_code text,
    welcome_message text,
    announcement text,
    is_locked boolean DEFAULT false,
    mood text DEFAULT 'chill'::text
);

CREATE TABLE public.password_reset_otps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    otp_code text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    is_used boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.payment_gateways (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    gateway_type text NOT NULL,
    api_key_ref text,
    config jsonb DEFAULT '{}'::jsonb,
    supported_currencies text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.payment_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    method_type text NOT NULL,
    icon_url text,
    instructions text,
    account_info jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    country_codes text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.payment_reconciliation_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_id uuid,
    gateway_id uuid,
    external_reference text,
    amount numeric(15,2) NOT NULL,
    currency text DEFAULT 'USD'::text,
    status text DEFAULT 'pending'::text,
    reconciled_at timestamp with time zone,
    discrepancy_amount numeric(15,2) DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.payment_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    package_id uuid,
    gateway_id uuid,
    amount numeric(10,2) NOT NULL,
    currency text DEFAULT 'USD'::text,
    status text DEFAULT 'pending'::text,
    external_transaction_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.payroll_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    beans_amount integer NOT NULL,
    usd_amount numeric(10,2) NOT NULL,
    payment_method text NOT NULL,
    payment_details jsonb DEFAULT '{}'::jsonb,
    status text DEFAULT 'pending'::text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.phone_otps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    phone_number text NOT NULL,
    otp_code text NOT NULL,
    purpose text DEFAULT 'login'::text,
    expires_at timestamp with time zone NOT NULL,
    is_used boolean DEFAULT false,
    delivery_method text DEFAULT 'whatsapp'::text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.pk_battle_gifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    battle_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    target_host_id uuid NOT NULL,
    gift_id uuid NOT NULL,
    coin_amount integer NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.pk_battles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    host1_id uuid NOT NULL,
    host2_id uuid NOT NULL,
    stream1_id uuid,
    stream2_id uuid,
    status text DEFAULT 'pending'::text,
    host1_score integer DEFAULT 0,
    host2_score integer DEFAULT 0,
    winner_id uuid,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    duration_minutes integer DEFAULT 5,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.topup_payment_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    method_type text NOT NULL,
    icon_url text,
    account_name text,
    account_number text,
    additional_info jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    payment_number text,
    payment_instructions text
);