import { useCallback } from "react";
import { InAppReview } from "@/plugins/InAppReview";

/**
 * Pkg233 / M27 — Smart in-app review trigger.
 *
 * Call `trigger(event)` after a high-satisfaction moment, e.g.
 *   - gift_sent_high_value      (gift ≥ premium tier)
 *   - live_stream_ended_good    (host stream ≥ 5 min + ≥1 gift)
 *   - dm_reply_sent             (after N successful sends — gate at caller)
 *   - call_completed_long       (private call ≥ 2 min, both sides connected)
 *
 * Internal throttling handled in InAppReview.maybeRequest (45-day gap,
 * ≤3 asks / year). Safe to fire-and-forget from any handler.
 */
export function useInAppReviewTrigger() {
  return useCallback((event: string) => {
    // Defer to next tick so we never block the success UX (toast/animation).
    setTimeout(() => {
      void InAppReview.maybeRequest(event);
    }, 1500);
  }, []);
}
