-- Pkg310 pass-2 follow-up: internal trigger helpers must not be callable from clients
REVOKE EXECUTE ON FUNCTION public.guard_reels_user_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_reel_comment_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_reel_report_write() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_reel_counter(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_reel_like_counter() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_reel_comment_counter() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_reel_share_counter() FROM PUBLIC, anon, authenticated;