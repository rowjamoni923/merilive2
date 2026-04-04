-- Table: pk_competition_rewards
CREATE TABLE public.pk_competition_rewards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    competition_id uuid NOT NULL,
    rank_from integer DEFAULT 1 NOT NULL,
    rank_to integer DEFAULT 1 NOT NULL,
    reward_diamonds integer DEFAULT 0 NOT NULL,
    reward_beans integer DEFAULT 0 NOT NULL,
    reward_coins integer DEFAULT 0 NOT NULL,
    reward_badge text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.pk_competition_rewards ENABLE ROW LEVEL SECURITY;

-- Table: pk_competitions
CREATE TABLE public.pk_competitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    banner_image_url text,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone NOT NULL,
    status text DEFAULT 'upcoming'::text NOT NULL,
    competition_type text DEFAULT 'gift_sending'::text NOT NULL,
    max_participants integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pk_competitions_competition_type_check CHECK ((competition_type = ANY (ARRAY['gift_sending'::text, 'gift_receiving'::text, 'coins_spent'::text, 'beans_earned'::text, 'custom'::text]))),
    CONSTRAINT pk_competitions_status_check CHECK ((status = ANY (ARRAY['upcoming'::text, 'active'::text, 'ended'::text, 'cancelled'::text])))
);
ALTER TABLE public.pk_competitions ENABLE ROW LEVEL SECURITY;

-- Table: pk_participants
CREATE TABLE public.pk_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    competition_id uuid NOT NULL,
    user_id uuid NOT NULL,
    score bigint DEFAULT 0 NOT NULL,
    rank_position integer,
    reward_distributed boolean DEFAULT false,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.pk_participants ENABLE ROW LEVEL SECURITY;

-- Table: pk_reward_banners
CREATE TABLE public.pk_reward_banners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    banner_image_url text,
    reward_details jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.pk_reward_banners ENABLE ROW LEVEL SECURITY;

-- Table: pk_reward_history
CREATE TABLE public.pk_reward_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    competition_id uuid NOT NULL,
    user_id uuid NOT NULL,
    rank_position integer NOT NULL,
    reward_diamonds integer DEFAULT 0,
    reward_beans integer DEFAULT 0,
    reward_coins integer DEFAULT 0,
    distributed_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.pk_reward_history ENABLE ROW LEVEL SECURITY;

-- Table: popup_event_banners
CREATE TABLE public.popup_event_banners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    image_url text NOT NULL,
    link_url text,
    link_type text DEFAULT 'internal'::text,
    display_duration_seconds integer DEFAULT 3 NOT NULL,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    skip_delay_seconds integer DEFAULT 4 NOT NULL,
    auto_dismiss_seconds integer DEFAULT 7 NOT NULL
);
ALTER TABLE public.popup_event_banners ENABLE ROW LEVEL SECURITY;

-- Table: poster_images
CREATE TABLE public.poster_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    image_url text NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.poster_images ENABLE ROW LEVEL SECURITY;

-- Table: private_call_security_logs
CREATE TABLE public.private_call_security_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    call_id uuid,
    user_id uuid,
    event_type text NOT NULL,
    device_info jsonb DEFAULT '{}'::jsonb,
    detected_at timestamp with time zone DEFAULT now(),
    action_taken text,
    CONSTRAINT private_call_security_logs_event_type_check CHECK ((event_type = ANY (ARRAY['screenshot_attempt'::text, 'screen_record_attempt'::text, 'screen_share_attempt'::text, 'app_switch'::text])))
);
ALTER TABLE public.private_call_security_logs ENABLE ROW LEVEL SECURITY;

-- Table: private_calls
CREATE TABLE public.private_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    caller_id uuid NOT NULL,
    host_id uuid NOT NULL,
    stream_id uuid,
    status text DEFAULT 'pending'::text NOT NULL,
    started_at timestamp with time zone,
    connected_at timestamp with time zone,
    ended_at timestamp with time zone,
    end_reason text,
    duration_seconds integer DEFAULT 0,
    coins_spent integer DEFAULT 0,
    coins_per_minute integer DEFAULT 60,
    caller_rating integer,
    host_rating integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    host_earnings_credited boolean DEFAULT false,
    host_earnings_amount integer DEFAULT 0,
    host_earnings_credited_at timestamp with time zone,
    host_earnings_credited_by uuid,
    admin_notes text,
    total_coins_deducted integer DEFAULT 0,
    host_earned integer DEFAULT 0,
    last_billing_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT private_calls_caller_rating_check CHECK (((caller_rating >= 1) AND (caller_rating <= 5))),
    CONSTRAINT private_calls_host_rating_check CHECK (((host_rating >= 1) AND (host_rating <= 5))),
    CONSTRAINT private_calls_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'ringing'::text, 'connected'::text, 'ended'::text, 'missed'::text, 'declined'::text])))
);
ALTER TABLE public.private_calls ENABLE ROW LEVEL SECURITY;

-- Table: profiles
CREATE TABLE public.profiles (
    id uuid NOT NULL,
    username text,
    display_name text,
    bio text,
    avatar_url text,
    cover_url text,
    country_code text DEFAULT 'BD'::text,
    country_name text DEFAULT 'বাংলাদেশ'::text,
    country_flag text DEFAULT '🇧🇩'::text,
    age integer,
    gender text,
    coins bigint DEFAULT 0,
    is_online boolean DEFAULT false,
    is_verified boolean DEFAULT false,
    last_seen_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_host boolean DEFAULT false,
    host_status text,
    host_level integer DEFAULT 1,
    total_earnings bigint DEFAULT 0,
    agency_id uuid,
    is_agency_owner boolean DEFAULT false,
    is_in_call boolean DEFAULT false,
    current_call_id uuid,
    call_rate_per_minute integer,
    total_call_minutes integer DEFAULT 0,
    total_calls_received integer DEFAULT 0,
    total_calls_made integer DEFAULT 0,
    user_level integer DEFAULT 0,
    total_consumption bigint DEFAULT 0,
    tags text[] DEFAULT '{}'::text[],
    is_blocked boolean DEFAULT false,
    blocked_at timestamp with time zone,
    blocked_reason text,
    pending_earnings numeric DEFAULT 0,
    app_uid character varying(12),
    city text,
    region text,
    phone_violation_count integer DEFAULT 0,
    frame_id uuid,
    is_face_verified boolean DEFAULT false,
    face_verification_image text,
    face_verified_at timestamp with time zone,
    weekly_earnings numeric DEFAULT 0,
    weekly_reset_at timestamp with time zone DEFAULT now(),
    equipped_frame_id uuid,
    equipped_entrance_id uuid,
    equipped_bubble_id uuid,
    equipped_vehicle_id uuid,
    beans bigint DEFAULT 0,
    deletion_requested_at timestamp with time zone,
    deletion_scheduled_at timestamp with time zone,
    is_deleted boolean DEFAULT false,
    face_hash text,
    max_user_level integer DEFAULT 0,
    current_vip_tier_id uuid,
    vip_expires_at timestamp with time zone,
    equipped_medal_id uuid,
    equipped_noble_card_id uuid,
    device_id text,
    equipped_entry_banner_id uuid,
    equipped_entry_name_bar_id uuid,
    previous_frame_id uuid,
    previous_entrance_id uuid,
    previous_bubble_id uuid,
    previous_vehicle_id uuid,
    previous_medal_id uuid,
    previous_noble_card_id uuid,
    previous_entry_banner_id uuid,
    previous_entry_name_bar_id uuid,
    hide_location boolean DEFAULT false NOT NULL,
    total_recharged bigint DEFAULT 0,
    active_session_id text,
    last_login_at timestamp with time zone,
    last_login_device text,
    registration_ip text,
    last_login_ip text,
    registration_device_info jsonb,
    last_login_device_info jsonb,
    registration_user_agent text,
    diamonds integer DEFAULT 0,
    previous_host_level integer DEFAULT 0,
    beans_balance integer DEFAULT 0,
    host_verified_at timestamp with time zone,
    CONSTRAINT coins_non_negative CHECK ((coins >= 0)),
    CONSTRAINT profiles_age_check CHECK (((age >= 18) AND (age <= 100))),
    CONSTRAINT profiles_coins_check CHECK ((coins >= 0)),
    CONSTRAINT profiles_gender_check CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['male'::text, 'female'::text, 'Male'::text, 'Female'::text, 'other'::text, 'Other'::text, 'prefer_not_to_say'::text]))))
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Table: provider_games
CREATE TABLE public.provider_games (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider_id uuid NOT NULL,
    game_code text NOT NULL,
    game_name text NOT NULL,
    game_category text,
    thumbnail_url text,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    min_bet integer DEFAULT 10,
    max_bet integer DEFAULT 10000,
    house_edge numeric DEFAULT 0.05,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.provider_games ENABLE ROW LEVEL SECURITY;

-- Table: ranking_rewards
CREATE TABLE public.ranking_rewards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ranking_type text NOT NULL,
    rank_position integer NOT NULL,
    reward_coins integer DEFAULT 0,
    reward_diamonds integer DEFAULT 0,
    reward_beans integer DEFAULT 0,
    reward_badge_url text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.ranking_rewards ENABLE ROW LEVEL SECURITY;

-- Table: rate_limit_attempts
CREATE TABLE public.rate_limit_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    ip_address text,
    action_type text NOT NULL,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.rate_limit_attempts ENABLE ROW LEVEL SECURITY;

-- Table: rate_limits
CREATE TABLE public.rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action_type text NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    window_seconds integer DEFAULT 300 NOT NULL,
    lockout_duration_seconds integer DEFAULT 900,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Table: rating_reward_claims
CREATE TABLE public.rating_reward_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    reward_coins integer DEFAULT 50 NOT NULL,
    platform text NOT NULL,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rating_reward_claims_platform_check CHECK ((platform = ANY (ARRAY['google_play'::text, 'app_store'::text])))
);
ALTER TABLE public.rating_reward_claims ENABLE ROW LEVEL SECURITY;

-- Table: recharge_transactions
CREATE TABLE public.recharge_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    helper_id uuid,
    order_id text,
    payment_method text,
    amount numeric NOT NULL,
    coins_amount integer NOT NULL,
    bonus_coins integer DEFAULT 0,
    status text DEFAULT 'pending'::text NOT NULL,
    payment_proof_url text,
    admin_notes text,
    processed_at timestamp with time zone,
    processed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    currency text DEFAULT 'BDT'::text,
    exchange_rate numeric DEFAULT 1,
    payment_method_id uuid,
    usd_amount numeric,
    CONSTRAINT recharge_transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'refunded'::text])))
);
ALTER TABLE public.recharge_transactions ENABLE ROW LEVEL SECURITY;

-- Table: recovery_tokens
CREATE TABLE public.recovery_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    token_type text DEFAULT 'password_reset'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.recovery_tokens ENABLE ROW LEVEL SECURITY;

-- Table: reel_categories
CREATE TABLE public.reel_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    icon_url text,
    display_order integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.reel_categories ENABLE ROW LEVEL SECURITY;

-- Table: reel_comments
CREATE TABLE public.reel_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reel_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    parent_id uuid,
    likes_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.reel_comments ENABLE ROW LEVEL SECURITY;

-- Table: reel_likes
CREATE TABLE public.reel_likes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reel_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.reel_likes ENABLE ROW LEVEL SECURITY;

-- Table: reel_reports
CREATE TABLE public.reel_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reel_id uuid NOT NULL,
    user_id uuid NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.reel_reports ENABLE ROW LEVEL SECURITY;

-- Table: reel_shares
CREATE TABLE public.reel_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reel_id uuid NOT NULL,
    user_id uuid NOT NULL,
    platform text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.reel_shares ENABLE ROW LEVEL SECURITY;

-- Table: reels
CREATE TABLE public.reels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    video_url text NOT NULL,
    thumbnail_url text,
    caption text,
    category_id uuid,
    music_id uuid,
    duration_seconds integer,
    views_count integer DEFAULT 0,
    likes_count integer DEFAULT 0,
    comments_count integer DEFAULT 0,
    shares_count integer DEFAULT 0,
    is_public boolean DEFAULT true,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;

-- Table: role_frames
CREATE TABLE public.role_frames (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    frame_url text NOT NULL,
    role_type text NOT NULL,
    min_level integer DEFAULT 0,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);
ALTER TABLE public.role_frames ENABLE ROW LEVEL SECURITY;

-- Table: room_welcome_messages
CREATE TABLE public.room_welcome_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid NOT NULL,
    message_text text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.room_welcome_messages ENABLE ROW LEVEL SECURITY;

-- Table: roulette_bets
CREATE TABLE public.roulette_bets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid NOT NULL,
    bet_type text NOT NULL,
    bet_value text NOT NULL,
    bet_amount integer NOT NULL,
    win_amount integer DEFAULT 0,
    is_winner boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.roulette_bets ENABLE ROW LEVEL SECURITY;

-- Table: roulette_sessions
CREATE TABLE public.roulette_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid,
    status text DEFAULT 'betting'::text NOT NULL,
    winning_number integer,
    winning_color text,
    total_bets integer DEFAULT 0,
    total_pool integer DEFAULT 0,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.roulette_sessions ENABLE ROW LEVEL SECURITY;

-- Table: seat_invitations
CREATE TABLE public.seat_invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid NOT NULL,
    inviter_id uuid NOT NULL,
    invitee_id uuid NOT NULL,
    seat_number integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:05:00'::interval) NOT NULL,
    CONSTRAINT seat_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'expired'::text])))
);
ALTER TABLE public.seat_invitations ENABLE ROW LEVEL SECURITY;

-- Table: seat_requests
CREATE TABLE public.seat_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    room_id uuid NOT NULL,
    user_id uuid NOT NULL,
    seat_number integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_at timestamp with time zone,
    CONSTRAINT seat_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text])))
);
ALTER TABLE public.seat_requests ENABLE ROW LEVEL SECURITY;

-- Table: security_alerts
CREATE TABLE public.security_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    alert_type text NOT NULL,
    severity text DEFAULT 'medium'::text NOT NULL,
    user_id uuid,
    ip_address text,
    description text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_resolved boolean DEFAULT false,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;

-- Table: security_audit_log
CREATE TABLE public.security_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    user_id uuid,
    ip_address text,
    user_agent text,
    details jsonb DEFAULT '{}'::jsonb,
    severity text DEFAULT 'info'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Table: session_security_logs
CREATE TABLE public.session_security_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_type text NOT NULL,
    ip_address text,
    user_agent text,
    device_fingerprint text,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.session_security_logs ENABLE ROW LEVEL SECURITY;

-- Table: shop_items
CREATE TABLE public.shop_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    category text NOT NULL,
    item_type text NOT NULL,
    price_coins integer DEFAULT 0,
    price_diamonds integer DEFAULT 0,
    image_url text,
    animation_url text,
    svga_url text,
    preview_url text,
    duration_days integer,
    is_permanent boolean DEFAULT false,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    level_required integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    vip_discount_percent integer DEFAULT 0,
    is_vip_exclusive boolean DEFAULT false,
    tag text
);
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;

-- Table: site_content
CREATE TABLE public.site_content (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    page_key text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    language text DEFAULT 'en'::text,
    is_published boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

-- Table: site_settings
CREATE TABLE public.site_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    setting_key text NOT NULL,
    setting_value text,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Table: sports
CREATE TABLE public.sports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    video_url text,
    thumbnail_url text,
    category text DEFAULT 'general'::text,
    source text,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.sports ENABLE ROW LEVEL SECURITY;

-- Table: stream_chat
CREATE TABLE public.stream_chat (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stream_id uuid NOT NULL,
    user_id uuid NOT NULL,
    message text NOT NULL,
    message_type text DEFAULT 'text'::text,
    is_pinned boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stream_chat_message_type_check CHECK ((message_type = ANY (ARRAY['text'::text, 'gift'::text, 'join'::text, 'leave'::text])))
);
ALTER TABLE public.stream_chat ENABLE ROW LEVEL SECURITY;