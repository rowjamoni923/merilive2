-- ====================================================
-- FIX: Remove conflicting permissive INSERT policies
-- that bypass the "block" policies on financial tables
-- RPC functions (SECURITY DEFINER) bypass RLS anyway
-- ====================================================

-- Gift Transactions: Remove the permissive "allow" policy, keep block
DROP POLICY IF EXISTS "Users can send gifts" ON gift_transactions;
DROP POLICY IF EXISTS "No direct gift inserts" ON gift_transactions;

-- Game Transactions: Remove the permissive "allow" policy, keep block
DROP POLICY IF EXISTS "Users can insert own game transactions" ON game_transactions;
DROP POLICY IF EXISTS "No direct game inserts" ON game_transactions;

-- Roulette Bets: Remove the permissive "allow" policy, keep block
DROP POLICY IF EXISTS "Users can place their own bets" ON roulette_bets;

-- Coin Transfers: Remove the permissive "allow" policy, keep block
DROP POLICY IF EXISTS "Agency owners can create transfers" ON coin_transfers;

-- Re-create clean block policies for all
-- Gift transactions - only through process_gift_transaction RPC
DROP POLICY IF EXISTS "No direct gift transaction inserts" ON gift_transactions;
CREATE POLICY "No direct gift transaction inserts"
ON gift_transactions FOR INSERT TO authenticated
WITH CHECK (false);

-- Game transactions - only through process_game_bet/win RPC
CREATE POLICY "No direct game transaction inserts"
ON game_transactions FOR INSERT TO authenticated
WITH CHECK (false);

-- Roulette bets - only through RPC
-- Already has "No direct roulette bet inserts"

-- Coin transfers - only through transfer_coins_to_user RPC
DROP POLICY IF EXISTS "No direct coin transfer inserts" ON coin_transfers;
CREATE POLICY "No direct coin transfer inserts"
ON coin_transfers FOR INSERT TO authenticated
WITH CHECK (false);