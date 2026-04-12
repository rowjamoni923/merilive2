-- ========== ADD PRIMARY KEYS ==========
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'gift_transactions','group_messages','helper_applications','helper_orders',
    'helper_transactions','helper_withdrawal_requests','live_streams',
    'party_room_participants','party_rooms','reel_comments','reel_reports',
    'reels','seat_requests','stream_recordings','user_reports',
    'helper_admin_messages','face_verification_submissions'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = tbl || '_pkey' 
      AND conrelid = ('public.' || tbl)::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I PRIMARY KEY (id)', tbl, tbl || '_pkey');
    END IF;
  END LOOP;
END $$;

-- ========== ADD FOREIGN KEYS TO profiles ==========

-- gift_transactions.sender_id -> profiles
ALTER TABLE public.gift_transactions
  ADD CONSTRAINT gift_transactions_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- group_messages.sender_id -> profiles
ALTER TABLE public.group_messages
  ADD CONSTRAINT group_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- helper_applications.user_id -> profiles
ALTER TABLE public.helper_applications
  ADD CONSTRAINT helper_applications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- face_verification_submissions.user_id -> profiles
ALTER TABLE public.face_verification_submissions
  ADD CONSTRAINT face_verification_submissions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- live_streams.host_id -> profiles
ALTER TABLE public.live_streams
  ADD CONSTRAINT live_streams_host_id_fkey
  FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- party_rooms.host_id -> profiles
ALTER TABLE public.party_rooms
  ADD CONSTRAINT party_rooms_host_id_fkey
  FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- party_room_participants.user_id -> profiles
ALTER TABLE public.party_room_participants
  ADD CONSTRAINT party_room_participants_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- reel_comments.user_id -> profiles
ALTER TABLE public.reel_comments
  ADD CONSTRAINT reel_comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- reel_reports.user_id -> profiles  
ALTER TABLE public.reel_reports
  ADD CONSTRAINT reel_reports_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- reels.user_id -> profiles
ALTER TABLE public.reels
  ADD CONSTRAINT reels_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- seat_requests.user_id -> profiles (code references as requester_id_fkey)
ALTER TABLE public.seat_requests
  ADD CONSTRAINT seat_requests_requester_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- stream_recordings.host_id -> profiles
ALTER TABLE public.stream_recordings
  ADD CONSTRAINT stream_recordings_host_id_fkey
  FOREIGN KEY (host_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- user_reports.reporter_id -> profiles
ALTER TABLE public.user_reports
  ADD CONSTRAINT user_reports_reporter_id_fkey
  FOREIGN KEY (reporter_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- user_reports.reported_id -> profiles (code uses reported_user_id alias)
ALTER TABLE public.user_reports
  ADD CONSTRAINT user_reports_reported_user_id_fkey
  FOREIGN KEY (reported_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ========== ADD FOREIGN KEYS TO topup_helpers ==========

-- helper_admin_messages.helper_id -> topup_helpers
ALTER TABLE public.helper_admin_messages
  ADD CONSTRAINT helper_admin_messages_helper_id_fkey
  FOREIGN KEY (helper_id) REFERENCES public.topup_helpers(id) ON DELETE CASCADE;

-- helper_orders.helper_id -> topup_helpers
ALTER TABLE public.helper_orders
  ADD CONSTRAINT helper_orders_helper_id_fkey
  FOREIGN KEY (helper_id) REFERENCES public.topup_helpers(id) ON DELETE CASCADE;

-- helper_orders.customer_id -> profiles (code uses user_id_fkey)
ALTER TABLE public.helper_orders
  ADD CONSTRAINT helper_orders_user_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- helper_transactions.helper_id -> topup_helpers
ALTER TABLE public.helper_transactions
  ADD CONSTRAINT helper_transactions_helper_id_fkey
  FOREIGN KEY (helper_id) REFERENCES public.topup_helpers(id) ON DELETE CASCADE;

-- helper_withdrawal_requests.helper_id -> topup_helpers (code uses host_id_fkey)
ALTER TABLE public.helper_withdrawal_requests
  ADD CONSTRAINT helper_withdrawal_requests_helper_id_fkey
  FOREIGN KEY (helper_id) REFERENCES public.topup_helpers(id) ON DELETE CASCADE;

-- ========== INDEXES ==========
CREATE INDEX IF NOT EXISTS idx_gift_transactions_sender ON public.gift_transactions(sender_id);
CREATE INDEX IF NOT EXISTS idx_live_streams_host ON public.live_streams(host_id);
CREATE INDEX IF NOT EXISTS idx_party_rooms_host ON public.party_rooms(host_id);
CREATE INDEX IF NOT EXISTS idx_reels_user ON public.reels(user_id);
CREATE INDEX IF NOT EXISTS idx_helper_orders_helper ON public.helper_orders(helper_id);
CREATE INDEX IF NOT EXISTS idx_helper_orders_customer ON public.helper_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_helper_transactions_helper ON public.helper_transactions(helper_id);