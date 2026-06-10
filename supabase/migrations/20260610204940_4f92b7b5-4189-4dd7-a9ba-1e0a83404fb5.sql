GRANT EXECUTE ON FUNCTION public.can_view_stream_viewer_row(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_enter_live_stream_row(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_admin_has_section_access(text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_effective_admin_role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_admin_owner_session() TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_agency_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_owner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_party_room_active_participant(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_party_room_host(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.users_have_block(uuid, uuid) TO authenticated, service_role;