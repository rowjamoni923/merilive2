
-- =============================================
-- REMAINING RLS POLICIES - FINAL BATCH (~44)
-- =============================================

-- 1. Admins can view all coin transfers
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all coin transfers" ON public.coin_transfers FOR SELECT USING (public.is_admin(auth.uid()))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 2. Admins can view all gift logs
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can view all gift logs" ON public.gift_transaction_logs FOR SELECT TO authenticated USING (public.is_admin(auth.uid()))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 3. Anyone can read active audio tracks
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read active audio tracks" ON public.content_audio_tracks FOR SELECT USING ((is_active = true))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 4. Anyone can read active content (site_content - no is_active, use true)
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read active content" ON public.site_content FOR SELECT USING (true)';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 5. Anyone can read active subtitles (content_subtitles - no is_active, use true)
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can read active subtitles" ON public.content_subtitles FOR SELECT USING (true)';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 6. Anyone can view active categories
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active categories" ON public.categories FOR SELECT TO authenticated USING ((is_active = true))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 7. Anyone can view active channels
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active channels" ON public.channels FOR SELECT TO authenticated USING ((is_active = true))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 8. Anyone can view active entertainment
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active entertainment" ON public.entertainment FOR SELECT TO authenticated USING ((is_active = true))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 9. Anyone can view active iptv sources
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active iptv sources" ON public.iptv_sources FOR SELECT TO authenticated USING ((is_active = true))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 10. Anyone can view active kids content
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active kids content" ON public.kids_content FOR SELECT TO authenticated USING ((is_active = true))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 11. Anyone can view active movies
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active movies" ON public.movies FOR SELECT TO authenticated USING ((is_active = true))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 12. Anyone can view active music
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active music" ON public.music FOR SELECT TO authenticated USING ((is_active = true))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 13. Anyone can view active news
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active news" ON public.news FOR SELECT TO authenticated USING ((is_active = true))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 14. Anyone can view active plans
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active plans" ON public.subscription_plans FOR SELECT TO authenticated USING ((is_active = true))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 15. Anyone can view active sports
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active sports" ON public.sports FOR SELECT TO authenticated USING ((is_active = true))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 16. Anyone can view active streams
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view active streams" ON public.live_streams FOR SELECT TO authenticated USING (true)';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 17. Anyone can view followers
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view followers" ON public.followers FOR SELECT TO authenticated USING (true)';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 18. Anyone can view site settings
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view site settings" ON public.site_settings FOR SELECT TO authenticated USING (true)';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 19. Anyone can view stream chat
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view stream chat" ON public.stream_chat FOR SELECT TO authenticated USING (true)';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 20. Anyone can view stream viewers
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view stream viewers" ON public.stream_viewers FOR SELECT TO authenticated USING (true)';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 21. Payment methods viewable
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Payment methods are viewable by everyone" ON public.payment_methods FOR SELECT TO authenticated USING ((is_active = true))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 22. Public can view active news sources
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Public can view active news sources" ON public.news_sources FOR SELECT TO authenticated USING ((is_active = true))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 23. Public can view active youtube sources
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Public can view active youtube sources" ON public.youtube_sources FOR SELECT TO authenticated USING ((is_active = true))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 24. Stream viewers can see gifts
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Stream viewers can see gifts" ON public.gift_transactions FOR SELECT USING (((stream_id IS NOT NULL) AND (auth.uid() IS NOT NULL)))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 25. Users can view messages for their tickets (fix app_role cast)
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Users can view messages for their tickets" ON public.support_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.support_tickets WHERE ((support_tickets.id = support_messages.ticket_id) AND ((support_tickets.user_id = auth.uid()) OR public.has_role(auth.uid(), ''admin''))))))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 26. Users can view messages in their conversations
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Users can view messages in their conversations" ON public.messages FOR SELECT TO authenticated USING (public.is_conversation_participant(auth.uid(), conversation_id))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 27. Users can view own conversations (fix participant_1/2 to participant1_id/2_id)
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Users can view own conversations" ON public.conversations FOR SELECT TO authenticated USING (((auth.uid() = participant1_id) OR (auth.uid() = participant2_id)))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 28. Users can view own subscriptions
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Users can view own subscriptions" ON public.user_subscriptions FOR SELECT TO authenticated USING ((auth.uid() = user_id))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 29. Users can view own transactions
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Users can view own transactions" ON public.gift_transactions FOR SELECT TO authenticated USING ((public.is_real_user() AND ((auth.uid() = sender_id) OR (auth.uid() = receiver_id))))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 30. Users can view their own invitations
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Users can view their own invitations" ON public.seat_invitations FOR SELECT TO authenticated USING (((invitee_id = auth.uid()) OR (host_id = auth.uid())))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 31. Users can view their own orders
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Users can view their own orders by email" ON public.subscription_orders FOR SELECT TO authenticated USING (true)';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 32. Users can view their own tickets (fix app_role cast)
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Users can view their own tickets" ON public.support_tickets FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), ''admin'')))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 33. Users manage own watchlist
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Users manage own watchlist" ON public.watchlist FOR ALL TO authenticated USING ((auth.uid() = user_id))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- =============================================
-- STORAGE BUCKETS & POLICIES
-- =============================================

-- Create storage buckets if not exist
INSERT INTO storage.buckets (id, name, public) VALUES ('content-media', 'content-media', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('channel-logos', 'channel-logos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('media-files', 'media-files', true) ON CONFLICT (id) DO NOTHING;

-- 34. Admins can delete content media
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can delete content media" ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = ''content-media'') AND public.has_role(auth.uid(), ''admin'')))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 35. Admins can upload content media
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Admins can upload content media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = ''content-media'') AND public.has_role(auth.uid(), ''admin'')))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 36. Anyone can view content media
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Anyone can view content media" ON storage.objects FOR SELECT USING ((bucket_id = ''content-media''))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 37. Auth users can delete channel logos
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can delete channel logos" ON storage.objects FOR DELETE USING ((bucket_id = ''channel-logos''))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 38. Auth users can delete media files
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can delete media files" ON storage.objects FOR DELETE USING ((bucket_id = ''media-files''))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 39. Auth users can update channel logos
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can update channel logos" ON storage.objects FOR UPDATE USING ((bucket_id = ''channel-logos''))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 40. Auth users can update media files
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can update media files" ON storage.objects FOR UPDATE USING ((bucket_id = ''media-files''))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 41. Auth users can upload channel logos
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can upload channel logos" ON storage.objects FOR INSERT WITH CHECK ((bucket_id = ''channel-logos''))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 42. Auth users can upload media files
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Authenticated users can upload media files" ON storage.objects FOR INSERT WITH CHECK ((bucket_id = ''media-files''))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 43. Channel logos publicly accessible
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Channel logos are publicly accessible" ON storage.objects FOR SELECT USING ((bucket_id = ''channel-logos''))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;

-- 44. Public can view media files
DO $safe$ BEGIN
  EXECUTE 'CREATE POLICY "Public can view media files" ON storage.objects FOR SELECT USING ((bucket_id = ''media-files''))';
EXCEPTION WHEN others THEN RAISE NOTICE 'Skipped: %', SQLERRM; END $safe$;
