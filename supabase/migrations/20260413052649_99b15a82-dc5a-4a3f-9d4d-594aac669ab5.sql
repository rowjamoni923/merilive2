
-- 1. MAKE STORAGE BUCKETS PRIVATE
UPDATE storage.buckets SET public = false WHERE id IN (
  'face-verification', 'host-verification', 'payment-proofs',
  'chat-media', 'voice-messages', 'support-attachments'
);

-- 2. STORAGE SELECT POLICIES
DROP POLICY IF EXISTS "face_verification_select" ON storage.objects;
CREATE POLICY "face_verification_select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'face-verification' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "host_verification_select" ON storage.objects;
CREATE POLICY "host_verification_select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'host-verification' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "payment_proofs_select" ON storage.objects;
CREATE POLICY "payment_proofs_select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'payment-proofs' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "chat_media_select" ON storage.objects;
CREATE POLICY "chat_media_select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'chat-media' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "voice_messages_select" ON storage.objects;
CREATE POLICY "voice_messages_select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'voice-messages' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "support_attachments_select" ON storage.objects;
CREATE POLICY "support_attachments_select" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'support-attachments' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin(auth.uid())));

-- 3. helper_payment_methods (helper_id is UUID)
DROP POLICY IF EXISTS "read_helper_payment_methods" ON public.helper_payment_methods;
CREATE POLICY "read_helper_payment_methods" ON public.helper_payment_methods
FOR SELECT TO authenticated
USING (helper_id = auth.uid() OR public.is_admin(auth.uid()));

-- 4. game_bets (player_id is UUID)
DROP POLICY IF EXISTS "a_read_game_bets" ON public.game_bets;
DROP POLICY IF EXISTS "read_game_bets" ON public.game_bets;
CREATE POLICY "read_own_game_bets" ON public.game_bets
FOR SELECT TO authenticated
USING (player_id = auth.uid() OR public.is_admin(auth.uid()));

-- 5. roulette_bets
DROP POLICY IF EXISTS "a_read_roulette_bets" ON public.roulette_bets;
DROP POLICY IF EXISTS "read_roulette_bets" ON public.roulette_bets;
CREATE POLICY "read_own_roulette_bets" ON public.roulette_bets
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- 6. live_game_bets
DROP POLICY IF EXISTS "a_read_live_game_bets" ON public.live_game_bets;
DROP POLICY IF EXISTS "read_live_game_bets" ON public.live_game_bets;
CREATE POLICY "read_own_live_game_bets" ON public.live_game_bets
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- 7. game_stats
DROP POLICY IF EXISTS "a_read_game_stats" ON public.game_stats;
DROP POLICY IF EXISTS "read_game_stats" ON public.game_stats;
CREATE POLICY "read_own_game_stats" ON public.game_stats
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- 8. live_moderation_settings - admin only
DROP POLICY IF EXISTS "read_live_moderation_settings" ON public.live_moderation_settings;
DROP POLICY IF EXISTS "anon_read_live_moderation_settings" ON public.live_moderation_settings;
DROP POLICY IF EXISTS "public_read_live_moderation_settings" ON public.live_moderation_settings;
CREATE POLICY "admin_read_live_moderation_settings" ON public.live_moderation_settings
FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

-- 9. poster_images - authenticated only
DROP POLICY IF EXISTS "read_poster_images" ON public.poster_images;
CREATE POLICY "read_poster_images" ON public.poster_images
FOR SELECT TO authenticated
USING (true);
