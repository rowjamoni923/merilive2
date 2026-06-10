REVOKE EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_self(uuid, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_self(uuid, bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_self(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helper_transfer_diamonds_to_self(uuid, bigint) TO service_role;