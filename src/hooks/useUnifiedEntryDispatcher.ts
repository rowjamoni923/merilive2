/**
 * useUnifiedEntryDispatcher — Phase 1 + Phase 2 of the entrance-effects
 * pro-rebuild.
 *
 * Phase 1 (G2 fix): single funnel + userId dedup across LiveKit / Realtime /
 * initial-fetch races so an arriving viewer triggers AT MOST one Premium
 * Entry Effect + one Flying Name Bar.
 *
 * Phase 2 (G3 fix — Bigo/Chamet/Poppo parity): rank-priority queue.
 *   - Incoming entries are buffered, not fired immediately.
 *   - A 0.5 s flush tick (industry "min entry gap") drains the buffer one
 *     entry at a time, highest rank first (king → duke → marquis → baron →
 *     knight → noble → none).
 *   - When buffer depth exceeds 3, identical-rank entries collapse: only
 *     the most recent per rank survives. This prevents a 10-viewer Lv2
 *     burst from monopolising the screen for 30 s and ensures a single
 *     Duke arrival cuts the line. (Phase 3 adds visible "+N others"
 *     overflow on the flying name bar.)
 *   - Vehicle-equipped entries are bumped up one rank tier — Bigo treats
 *     a vehicle as a soft Duke even if the user has no Noble title.
 *
 * Phase 5 hook (welcome chat coalescer) and Phase 4 hook (game-round
 * suppression) extend this dispatcher without breaking the public API.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  useEntryAnimations,
  type AddEntryParams,
} from '@/hooks/useEntryAnimations';
import {
  createJoinMessageCoalescer,
  type CoalescedJoin,
  type JoinCoalescer,
} from '@/utils/joinMessageCoalescer';

export type EntryRoomType =
  | 'live'
  | 'audio_party'
  | 'video_party'
  | 'game_party';

export interface UnifiedEntryDispatcherOptions {
  roomId: string;
  roomType: EntryRoomType;
  selfUserId?: string | null;
  onWelcomeRow?: (out: CoalescedJoin) => void;
  welcomeWindowMs?: number;
  /** How long to remember a userId after pushing. Default 60 s. */
  userDedupWindowMs?: number;
  /** Min gap between two queue dispatches. Default 500 ms (Bigo/Chamet). */
  minEntryGapMs?: number;
  /** Buffer depth past which identical-rank entries collapse. Default 3. */
  coalesceDepthThreshold?: number;
  /**
   * Phase 4 (WeJoy / Crush Live parity): when true, premium full-screen
   * effects (vehicle + entrance) are HELD during active gameplay and
   * batch-flushed at `flushSuppressed()` (host should call at round end /
   * between rounds). Flying name bars + welcome chat continue normally
   * — gamers still see who arrived, just no dragon over the Ludo board.
   *
   * Auto-defaults to `true` for `roomType === 'game_party'`. Callers can
   * force `false` (always play premium, even mid-round) or wire round
   * state by toggling at runtime via the returned `setSuppressPremium`.
   */
  suppressPremiumDuringGame?: boolean;
  /**
   * Safety net: held premium entries auto-flush after this many ms even
   * if no one calls `flushSuppressed`. Default 30 s — long enough to
   * cover one Ludo turn, short enough that no viewer feels "ghosted".
   */
  suppressedAutoFlushMs?: number;
  /** Hard cap on suppressed queue; oldest dropped past this. Default 10. */
  suppressedMaxQueue?: number;
}

export interface PushEntryParams extends AddEntryParams {
  withWelcome?: boolean;
}

/**
 * Industry rank → numeric priority. Higher = dispatched first.
 * Mirrors Bigo / Chamet Noble tiers. Unknown / missing codes fall to 0.
 * Vehicle-equipped entries get a +1 soft bump (handled at enqueue time).
 */
const RANK_PRIORITY: Record<string, number> = {
  king: 60,
  emperor: 60,
  duke: 50,
  marquis: 40,
  earl: 35,
  count: 35,
  baron: 30,
  viscount: 25,
  knight: 20,
  noble: 15,
};

function rankOf(p: PushEntryParams): number {
  const code = (p.rankCode || '').toLowerCase().trim();
  const base = RANK_PRIORITY[code] ?? 0;
  // Vehicle-equipped → soft +5 (puts a vehicled commoner above a plain knight,
  // below a plain duke). Bigo treats vehicle assets as visual nobility.
  const vehicleBoost = p.vehicleAnimationUrl ? 5 : 0;
  // Owning a flying name bar is a smaller signal — +1 tiebreaker only.
  const nameBarBoost = p.entryNameBarUrl ? 1 : 0;
  return base + vehicleBoost + nameBarBoost;
}

interface QueuedEntry {
  params: PushEntryParams;
  rank: number;
  enqueuedAt: number;
}

export function useUnifiedEntryDispatcher(opts: UnifiedEntryDispatcherOptions) {
  const {
    roomId,
    roomType,
    selfUserId,
    onWelcomeRow,
    welcomeWindowMs = 500,
    userDedupWindowMs = 60_000,
    minEntryGapMs = 500,
    coalesceDepthThreshold = 3,
    suppressPremiumDuringGame = roomType === 'game_party',
    suppressedAutoFlushMs = 30_000,
    suppressedMaxQueue = 10,
  } = opts;

  const inner = useEntryAnimations();

  const userSeenRef = useRef<Map<string, number>>(new Map());
  const coalescerRef = useRef<JoinCoalescer | null>(null);

  // Phase 2 priority queue + drain machinery
  const queueRef = useRef<QueuedEntry[]>([]);
  const lastDispatchAtRef = useRef<number>(0);
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Phase 4 suppression: premium full-screen effects held during gameplay,
  // released by `flushSuppressed()` (host) or by the auto-flush watchdog.
  const suppressPremiumRef = useRef<boolean>(suppressPremiumDuringGame);
  const suppressedQueueRef = useRef<QueuedEntry[]>([]);
  const suppressedFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  // ---- Welcome coalescer lifecycle ----
  useEffect(() => {
    coalescerRef.current?.dispose();
    coalescerRef.current = createJoinMessageCoalescer({
      windowMs: welcomeWindowMs,
      selfUserId: selfUserId ?? null,
      onEmit: (out) => {
        try { onWelcomeRow?.(out); } catch { /* swallow */ }
      },
    });
    return () => {
      coalescerRef.current?.flush();
      coalescerRef.current?.dispose();
      coalescerRef.current = null;
    };
  }, [welcomeWindowMs, selfUserId, onWelcomeRow]);

  // Reset state when hopping rooms.
  useEffect(() => {
    userSeenRef.current.clear();
    queueRef.current = [];
    if (drainTimerRef.current) {
      clearTimeout(drainTimerRef.current);
      drainTimerRef.current = null;
    }
    return () => {
      userSeenRef.current.clear();
      queueRef.current = [];
      if (drainTimerRef.current) {
        clearTimeout(drainTimerRef.current);
        drainTimerRef.current = null;
      }
    };
  }, [roomId]);

  /**
   * Collapse identical-rank entries when the buffer is overloaded. Keeps
   * the most recently enqueued per rank (Bigo: "newest arrival wins the
   * slot, older identical-rank arrivals merge into overflow"). Higher /
   * lower rank entries are NEVER dropped — only ties are coalesced.
   * Phase 3 will surface the dropped count as "+N others" on the bar.
   */
  function coalesceIfOverloaded() {
    const q = queueRef.current;
    if (q.length <= coalesceDepthThreshold) return;
    const seenRanks = new Set<number>();
    const kept: QueuedEntry[] = [];
    // Walk newest → oldest so newer arrivals win the slot.
    for (let i = q.length - 1; i >= 0; i--) {
      const item = q[i];
      if (seenRanks.has(item.rank) && q.length > coalesceDepthThreshold) {
        // Drop this older identical-rank entry. (Phase 3 will increment
        // an overflow counter on the surviving entry of the same rank.)
        continue;
      }
      seenRanks.add(item.rank);
      kept.push(item);
    }
    kept.reverse();
    queueRef.current = kept;
  }

  function scheduleDrain() {
    if (drainTimerRef.current) return;
    const now = Date.now();
    const wait = Math.max(0, lastDispatchAtRef.current + minEntryGapMs - now);
    drainTimerRef.current = setTimeout(drainOnce, wait);
  }

  function drainOnce() {
    drainTimerRef.current = null;
    const q = queueRef.current;
    if (q.length === 0) return;

    // Pick highest rank; on tie, oldest first (FIFO within rank).
    let bestIdx = 0;
    for (let i = 1; i < q.length; i++) {
      if (q[i].rank > q[bestIdx].rank) bestIdx = i;
    }
    const [next] = q.splice(bestIdx, 1);

    lastDispatchAtRef.current = Date.now();
    try {
      inner.addEntryAnimation(next.params);
    } catch (e) {
      console.warn('[UnifiedEntryDispatcher] inner dispatch failed', e);
    }

    if (queueRef.current.length > 0) scheduleDrain();
  }

  const pushEntry = useCallback((params: PushEntryParams) => {
    if (!params?.userId) return;

    const now = Date.now();
    const lastSeen = userSeenRef.current.get(params.userId);
    const isFreshUser = !lastSeen || now - lastSeen > userDedupWindowMs;

    // Always record latest seen-at so a quiet user's re-entry resets fresh
    // after the window elapses.
    userSeenRef.current.set(params.userId, now);

    if (isFreshUser) {
      // Drop any already-queued entry for the same user (newer payload
      // wins — typically the richer Realtime broadcast supersedes the
      // bare LiveKit ParticipantConnected payload).
      queueRef.current = queueRef.current.filter(
        (q) => q.params.userId !== params.userId,
      );
      queueRef.current.push({
        params,
        rank: rankOf(params),
        enqueuedAt: now,
      });
      coalesceIfOverloaded();
      scheduleDrain();
    }
    // else: dedup window still active — silently swallow.

    if (params.withWelcome && coalescerRef.current) {
      coalescerRef.current.push({
        id: `welcome_${params.userId}_${now}`,
        userId: params.userId,
        userName: params.displayName,
        userLevel: params.level,
        avatarUrl: params.avatarUrl,
      });
    }
  }, [userDedupWindowMs, minEntryGapMs, coalesceDepthThreshold, inner]);

  const flushWelcome = useCallback(() => {
    coalescerRef.current?.flush();
  }, []);

  const forgetUser = useCallback((userId: string) => {
    userSeenRef.current.delete(userId);
    queueRef.current = queueRef.current.filter(
      (q) => q.params.userId !== userId,
    );
  }, []);

  const clearAll = useCallback(() => {
    userSeenRef.current.clear();
    queueRef.current = [];
    if (drainTimerRef.current) {
      clearTimeout(drainTimerRef.current);
      drainTimerRef.current = null;
    }
    coalescerRef.current?.dispose();
    inner.clearAllAnimations();
  }, [inner]);

  return useMemo(() => ({
    entryAnimations: inner.entryAnimations,
    nameBarAnimations: inner.nameBarAnimations,
    nameBarOverflowCount: inner.nameBarOverflowCount,
    removeEntryAnimation: inner.removeEntryAnimation,
    removeNameBarAnimation: inner.removeNameBarAnimation,
    hasActiveAnimation: inner.hasActiveAnimation,
    pushEntry,
    /** Back-compat alias so existing call sites keep working. */
    addEntryAnimation: pushEntry,
    flushWelcome,
    forgetUser,
    clearAll,
  }), [inner, pushEntry, flushWelcome, forgetUser, clearAll]);
}

export default useUnifiedEntryDispatcher;
