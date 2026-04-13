-- ============================================================
-- 1. FIX: Remove overly permissive OTP read policy
-- ============================================================
DROP POLICY IF EXISTS "a_read_pw_otps" ON public.password_reset_otps;

-- ============================================================
-- 2. FIX: Remove wildcard storage policies
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete files" ON storage.objects;

-- Add owner-scoped storage policies for common buckets
DO $$
DECLARE
  b TEXT;
BEGIN
  FOR b IN SELECT unnest(ARRAY['avatars','cover-images','host-photos','chat-media','reels','payment-proofs','face-verification','host-verification'])
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY "owner_upload_%1$s" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %2$L AND (storage.foldername(name))[1] = auth.uid()::text)',
        b, b
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      EXECUTE format(
        'CREATE POLICY "owner_update_%1$s" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %2$L AND (storage.foldername(name))[1] = auth.uid()::text)',
        b, b
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      EXECUTE format(
        'CREATE POLICY "owner_delete_%1$s" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %2$L AND (storage.foldername(name))[1] = auth.uid()::text)',
        b, b
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END;
$$;

-- ============================================================
-- 3. FIX: Remove live-recordings from public read policy
-- ============================================================
-- We need to recreate the policy without live-recordings
DO $$
BEGIN
  -- Drop existing public read policy
  DROP POLICY IF EXISTS "Public read access for all public buckets" ON storage.objects;
  
  -- Recreate without live-recordings
  CREATE POLICY "Public read access for all public buckets" ON storage.objects 
    FOR SELECT USING (
      bucket_id IN ('avatars', 'cover-images', 'host-photos', 'gifts', 'banners', 'animations', 'app-assets', 'shop-items', 'reels')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- ============================================================
-- 4. FIX: Helper payment methods - remove anon access
-- ============================================================
DROP POLICY IF EXISTS "public_read" ON public.helper_payment_methods;
DROP POLICY IF EXISTS "public_read" ON public.helper_country_payment_methods;

-- Re-create as authenticated only
DO $$
BEGIN
  CREATE POLICY "auth_read_helper_pm" ON public.helper_payment_methods FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE POLICY "auth_read_helper_cpm" ON public.helper_country_payment_methods FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- ============================================================
-- 5. FIX: Gift transactions - scope to participants
-- ============================================================
DROP POLICY IF EXISTS "Stream viewers can see gifts" ON public.gift_transactions;

DO $$
BEGIN
  CREATE POLICY "gift_tx_own_or_admin" ON public.gift_transactions FOR SELECT TO authenticated
    USING (
      sender_id = auth.uid() OR 
      receiver_id = auth.uid() OR 
      public.is_admin(auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- ============================================================
-- 6. FIX: Tables with RLS enabled but no policies
-- ============================================================
-- limited_offer_claims
DO $$
BEGIN
  CREATE POLICY "own_claims" ON public.limited_offer_claims FOR SELECT TO authenticated USING (user_id = auth.uid());
  CREATE POLICY "own_insert_claims" ON public.limited_offer_claims FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- welcome_bonuses
DO $$
BEGIN
  CREATE POLICY "own_bonus" ON public.welcome_bonuses FOR SELECT TO authenticated USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- vpn_detection_logs - admin only
DO $$
BEGIN
  CREATE POLICY "admin_vpn_logs" ON public.vpn_detection_logs FOR ALL TO authenticated USING (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- vip_exclusive_items - read by authenticated
DO $$
BEGIN
  CREATE POLICY "auth_read_vip_items" ON public.vip_exclusive_items FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- ============================================================
-- 7. FIX: Function search_path
-- ============================================================
ALTER FUNCTION public.find_account_by_face SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 8. FIX: Group messages - scope to members
-- ============================================================
DROP POLICY IF EXISTS "a_read_grp_msg" ON public.group_messages;

DO $$
BEGIN
  CREATE POLICY "grp_msg_member_read" ON public.group_messages FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.group_members gm 
        WHERE gm.group_id = group_messages.group_id 
        AND gm.user_id = auth.uid()
      )
      OR public.is_admin(auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- Party room messages - scope to participants
DROP POLICY IF EXISTS "a_read_party_msg" ON public.party_room_messages;

DO $$
BEGIN
  CREATE POLICY "party_msg_participant_read" ON public.party_room_messages FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.party_room_participants prp 
        WHERE prp.room_id = party_room_messages.room_id 
        AND prp.user_id = auth.uid()
      )
      OR public.is_admin(auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- ============================================================
-- 9. FIX: Rate limits - admin only
-- ============================================================
DROP POLICY IF EXISTS "a_read_rate_lim" ON public.rate_limits;

DO $$
BEGIN
  CREATE POLICY "admin_read_rate_limits" ON public.rate_limits FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- ============================================================
-- 10. FIX: Topup payment methods - remove anon
-- ============================================================
-- Check if there's an anon policy and replace
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'topup_payment_methods' AND schemaname = 'public' AND qual = 'true' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.topup_payment_methods', pol.policyname);
  END LOOP;
  
  CREATE POLICY "auth_read_topup_pm" ON public.topup_payment_methods FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- ============================================================
-- 11. FIX: Seat invitations & requests - scope to participants
-- ============================================================
DROP POLICY IF EXISTS "a_read_seat_inv" ON public.seat_invitations;
DROP POLICY IF EXISTS "a_read_seat_req" ON public.seat_requests;

DO $$
BEGIN
  CREATE POLICY "seat_inv_own" ON public.seat_invitations FOR SELECT TO authenticated
    USING (inviter_id = auth.uid() OR invitee_id = auth.uid() OR public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  CREATE POLICY "seat_req_own" ON public.seat_requests FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;