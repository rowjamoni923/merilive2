GRANT EXECUTE ON FUNCTION public.helper_transfer_coins_to_user(uuid, uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.helper_transfer_coins_to_user(uuid, uuid, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.helper_transfer_coins_to_user(uuid, uuid, bigint, text) TO anon;