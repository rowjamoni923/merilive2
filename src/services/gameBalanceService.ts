import { supabase } from "@/integrations/supabase/client";
import { updateCachedBalance } from "@/hooks/useUserBalance";

/**
 * Game Balance Service - ATOMIC & RACE-CONDITION SAFE
 * Uses PostgreSQL FOR UPDATE row locking via RPC functions
 * 
 * - placeBet: Atomic diamond deduction
 * - processWin: Atomic diamond addition
 * - All transactions logged automatically by the RPC
 */

interface TransactionResult {
  success: boolean;
  newBalance?: number;
  error?: string;
}

/**
 * Place a bet - atomically deducts diamonds from user balance
 * Uses place_game_bet RPC with FOR UPDATE locking
 */
export const placeBet = async (
  userId: string,
  gameId: string,
  gameName: string,
  amount: number
): Promise<TransactionResult> => {
  try {
    const { data, error } = await supabase.rpc('place_game_bet', {
      p_user_id: userId,
      p_amount: Math.floor(amount),
      p_game_id: gameId,
      p_game_name: gameName,
    });

    if (error) {
      console.error("Place bet RPC error:", error);
      return { success: false, error: "Transaction failed" };
    }

    const result = data as { success: boolean; new_balance?: number; error?: string };

    if (!result.success) {
      return { success: false, error: result.error || "Bet failed" };
    }

    // Update cached balance for instant UI reflection
    if (result.new_balance !== undefined) {
      updateCachedBalance(result.new_balance);
    }

    return { success: true, newBalance: result.new_balance };
  } catch (error) {
    console.error("Place bet error:", error);
    return { success: false, error: "Transaction failed" };
  }
};

/**
 * Process win - atomically adds diamonds to user balance
 * Uses process_game_win RPC with FOR UPDATE locking
 */
export const processWin = async (
  userId: string,
  gameId: string,
  gameName: string,
  winAmount: number,
  multiplier?: number,
  isJackpot: boolean = false
): Promise<TransactionResult> => {
  try {
    const { data, error } = await supabase.rpc('process_game_win', {
      p_user_id: userId,
      p_amount: Math.floor(winAmount),
      p_game_id: gameId,
      p_game_name: gameName,
      p_multiplier: multiplier ?? null,
      p_is_jackpot: isJackpot,
    });

    if (error) {
      console.error("Process win RPC error:", error);
      return { success: false, error: "Transaction failed" };
    }

    const result = data as { success: boolean; new_balance?: number; error?: string };

    if (!result.success) {
      return { success: false, error: result.error || "Win processing failed" };
    }

    // Update cached balance for instant UI reflection
    if (result.new_balance !== undefined) {
      updateCachedBalance(result.new_balance);
    }

    return { success: true, newBalance: result.new_balance };
  } catch (error) {
    console.error("Process win error:", error);
    return { success: false, error: "Transaction failed" };
  }
};

/**
 * Get user's game transaction history
 */
export const getGameHistory = async (userId: string, limit: number = 50) => {
  const { data, error } = await supabase
    .from("game_transactions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Get game history error:", error);
    return [];
  }

  return data || [];
};

/**
 * Get user's current diamond balance
 */
export const getDiamondBalance = async (userId: string): Promise<number> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("coins")
    .eq("id", userId)
    .single();

  if (error || !data) {
    return 0;
  }

  return data.coins || 0;
};
