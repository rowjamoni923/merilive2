-- Pkg351c emergency role repair for Pkg347 direct admin table writes
-- These policies already require section permissions; adding anon only lets
-- adminSupabase's anon-key + x-admin-token request reach that permission check.

ALTER POLICY pkg347_banned_face_hashes_admin_write ON public.banned_face_hashes
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['face-violations','face-verification','moderation','moderation-hub','live-bans','user-management']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['face-violations','face-verification','moderation','moderation-hub','live-bans','user-management']::text[], true));

ALTER POLICY pkg347_content_audio_tracks_admin_write ON public.content_audio_tracks
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['reels','content-hub','reel-categories','moderation','moderation-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['reels','content-hub','reel-categories','moderation','moderation-hub']::text[], true));

ALTER POLICY pkg347_content_subtitles_admin_write ON public.content_subtitles
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['reels','content-hub','reel-categories','moderation','moderation-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['reels','content-hub','reel-categories','moderation','moderation-hub']::text[], true));

ALTER POLICY pkg347_reel_categories_admin_write ON public.reel_categories
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['reel-categories','reels','content-hub','moderation','moderation-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['reel-categories','reels','content-hub','moderation','moderation-hub']::text[], true));

ALTER POLICY pkg347_reels_admin_write ON public.reels
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['reels','moderation','moderation-hub','content-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['reels','moderation','moderation-hub','content-hub']::text[], true));

ALTER POLICY pkg347_reel_comments_admin_write ON public.reel_comments
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['reels','moderation','moderation-hub','content-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['reels','moderation','moderation-hub','content-hub']::text[], true));

ALTER POLICY pkg347_reel_likes_admin_write ON public.reel_likes
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['reels','moderation','moderation-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['reels','moderation','moderation-hub']::text[], true));

ALTER POLICY pkg347_reel_reports_admin_write ON public.reel_reports
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['user-reports','reports','reels','moderation','moderation-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['user-reports','reports','reels','moderation','moderation-hub']::text[], true));

ALTER POLICY pkg347_reel_shares_admin_write ON public.reel_shares
  TO anon, authenticated
  USING (public.admin_has_any_section_permission(ARRAY['reels','moderation','moderation-hub']::text[], true))
  WITH CHECK (public.admin_has_any_section_permission(ARRAY['reels','moderation','moderation-hub']::text[], true));