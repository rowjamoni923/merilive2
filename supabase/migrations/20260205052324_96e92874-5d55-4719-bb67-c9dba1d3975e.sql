-- Fix user balance who was not credited after recharge
-- User 251cbe57-e46b-41c0-bfb5-4cfcad9d6499 had 650000 coins recharge that wasn't credited

UPDATE profiles 
SET coins = COALESCE(coins, 0) + 650000 
WHERE id = '251cbe57-e46b-41c0-bfb5-4cfcad9d6499'
AND coins = 0;

-- Also verify the RPC function has proper execution rights
GRANT EXECUTE ON FUNCTION public.add_coins_to_user(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_coins_to_user(UUID, INTEGER) TO anon;