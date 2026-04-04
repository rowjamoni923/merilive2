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
    // All leaderboard data derives from gift_transactions and private_calls
    // which are already in the universal realtime channel
    const subscriberId = `leaderboard-${Date.now()}`;

    const unsubscribe = subscribeToTables(
      subscriberId,
      ['gift_transactions', 'private_calls'],
      (table, event, _payload) => {
        const keys = CATEGORY_QUERY_KEYS[categoryRef.current];
        if (!keys) return;

        // For host_earning: both gift_transactions and private_calls matter
        // For others: only gift_transactions matter
        if (categoryRef.current !== 'host_earning' && table === 'private_calls') return;

        keys.forEach((key) => {
          // Append periodType for period-specific queries
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
