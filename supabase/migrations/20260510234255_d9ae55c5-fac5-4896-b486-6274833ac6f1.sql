REVOKE ALL ON FUNCTION public.get_next_available_shard() FROM anon;
REVOKE ALL ON FUNCTION public.report_live_face_event(uuid, text, text, integer, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.admin_live_face_warnings_stats(integer) FROM anon;
REVOKE ALL ON FUNCTION public.admin_list_live_face_warnings_paginated(integer, integer, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_rekognition_shard_stats() FROM anon;

COMMENT ON FUNCTION public.report_live_face_event(uuid, text, text, integer, jsonb) IS
  'Host device: log live face ML events (warning / autoend / returned). Uses auth.uid() as host_id; RLS + validate trigger apply.';
COMMENT ON FUNCTION public.admin_live_face_warnings_stats(integer) IS
  'Admin dashboard: aggregate face-warning stats for last p_days. Requires is_active_admin_session().';
COMMENT ON FUNCTION public.admin_list_live_face_warnings_paginated(integer, integer, text, uuid) IS
  'Admin dashboard: paginated live_face_warnings with profiles_public username/avatar. Requires is_active_admin_session().';
COMMENT ON FUNCTION public.admin_rekognition_shard_stats() IS
  'Admin dashboard: Rekognition shard utilization rows. Requires is_active_admin_session().';
COMMENT ON FUNCTION public.get_next_available_shard() IS
  'Backend: pick least-filled active Rekognition shard under capacity. SECURITY DEFINER.';