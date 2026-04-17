import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { subscribeToTables } from "@/hooks/useUniversalRealtime";

type RankingCategory = "host_earning" | "game_ranking" | "top_gifter" | "pk_competition";
type PeriodType = "daily" | "weekly" | "monthly";

/**
 * Real-time subscriptions for all leaderboard categories.
 * Uses the universal realtime channel instead of creating separate channels.
 * Automatically invalidates the relevant React Query cache when
 * new data arrives, causing an instant re-fetch and UI update.
 */

// Map category to the query keys that should be invalidated
const CATEGORY_QUERY_KEYS: Record<RankingCategory, string[][]> = {
  host_earning: [["host-rankings-v2"]],
  game_ranking: [["game-rankings-v2"]],
  top_gifter: [["gifter-rankings-v2"]],
  pk_competition: [["pk-participants-dynamic"], ["pk-competitions-active"]],
};

export function useLeaderboardRealtime(
  activeCategory: RankingCategory,
  periodType: PeriodType
) {
  const queryClient = useQueryClient();
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  const categoryRef = useRef(activeCategory);
  categoryRef.current = activeCategory;

  const periodRef = useRef(periodType);
  periodRef.current = periodType;

  useEffect(() => {
    const subscriberId = `leaderboard-${Date.now()}`;

    // Listen to ALL leaderboard data sources:
    //   - gift_transactions → top_gifter, host_earning
    //   - private_calls → host_earning
    //   - game_transactions, live_game_bets, live_game_rounds → game_ranking
    //   - pk_participants, pk_battle_gifts, pk_battles → pk_competition
    const unsubscribe = subscribeToTables(
      subscriberId,
      [
        'gift_transactions',
        'private_calls',
        'game_transactions',
        'live_game_bets',
        'live_game_rounds',
        'pk_participants',
        'pk_battle_gifts',
        'pk_battles',
      ],
      (table, _event, _payload) => {
        const cat = categoryRef.current;
        const keys = CATEGORY_QUERY_KEYS[cat];
        if (!keys) return;

        // Per-category routing — only invalidate when the changed table
        // actually affects the current leaderboard category.
        const isGiftOrCall = table === 'gift_transactions' || table === 'private_calls';
        const isGameTable = table === 'game_transactions' || table === 'live_game_bets' || table === 'live_game_rounds';
        const isPkTable = table === 'pk_participants' || table === 'pk_battle_gifts' || table === 'pk_battles';

        if (cat === 'host_earning' && !isGiftOrCall) return;
        if (cat === 'top_gifter' && table !== 'gift_transactions') return;
        if (cat === 'game_ranking' && !isGameTable) return;
        if (cat === 'pk_competition' && !isPkTable) return;

        keys.forEach((key) => {
          const fullKey = key[0]?.includes('rankings') ? [...key, periodRef.current] : key;
          queryClientRef.current.invalidateQueries({
            queryKey: fullKey,
            refetchType: 'active',
          });
        });
      }
    );

    return unsubscribe;
  }, []);
}
