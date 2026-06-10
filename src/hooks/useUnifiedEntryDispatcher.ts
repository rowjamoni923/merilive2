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
  /**
   * Phase 5: extra gap AFTER a premium full-screen entry (vehicle/entrance)
   * so the next animation doesn't overlap a 3-4s dragon/car cinematic.
   * Default 3500 ms — covers BIGO/Chamet vehicle spans without starving
   * commoner entries. Flying-name-bar-only entries fall back to
   * `minEntryGapMs`.
   */
  premiumEntryGapMs?: number;
  /** Buffer depth past which identical-rank entries collapse. Default 3. */
  coalesceDepthThreshold?: number;
  /**
   * Phase 5: when true (default), every fresh-user dispatch also pushes
   * a welcome row into the chat coalescer — no per-call-site change
   * needed. Set false to opt out and rely on explicit `withWelcome`.
   */
  welcomeOnEveryEntry?: boolean;
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
    premiumEntryGapMs = 3500,
    coalesceDepthThreshold = 3,
    welcomeOnEveryEntry = true,
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

  // Phase 5: remember whether last dispatch was premium so the next drain
  // waits the longer `premiumEntryGapMs` window.
  // P1 FIX: useRef so the flag survives re-renders.
  const lastWasPremiumRef = useRef(false);

  function scheduleDrain() {
    if (drainTimerRef.current) return;
    const now = Date.now();
    const gap = lastWasPremiumRef.current ? premiumEntryGapMs : minEntryGapMs;
    const wait = Math.max(0, lastDispatchAtRef.current + gap - now);
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
    lastWasPremiumRef.current = hasPremium(next.params);
    try {
      inner.addEntryAnimation(next.params);
    } catch (e) {
      console.warn('[UnifiedEntryDispatcher] inner dispatch failed', e);
    }

    if (queueRef.current.length > 0) scheduleDrain();
  }


  /**
   * Strip premium full-screen URLs from a payload, leaving the flying
   * name bar + welcome chat metadata intact. Used when game suppression
   * is active so the gamer still sees "who arrived" without a dragon
   * covering the Ludo board.
   */
  function stripPremium(p: PushEntryParams): PushEntryParams {
    return {
      ...p,
      vehicleAnimationUrl: undefined,
      entranceUrl: undefined,
      soundUrl: undefined,
    };
  }

  function hasPremium(p: PushEntryParams): boolean {
    return !!(p.vehicleAnimationUrl || p.entranceUrl);
  }

  function armSuppressedAutoFlush() {
    if (suppressedFlushTimerRef.current) return;
    suppressedFlushTimerRef.current = setTimeout(() => {
      suppressedFlushTimerRef.current = null;
      flushSuppressedInternal('auto');
    }, suppressedAutoFlushMs);
  }

  function flushSuppressedInternal(reason: 'auto' | 'manual') {
    const held = suppressedQueueRef.current;
    if (held.length === 0) return;
    console.log(
      `[UnifiedEntryDispatcher] 🎮 Flushing ${held.length} suppressed premium entr${held.length === 1 ? 'y' : 'ies'} (${reason})`,
    );
    // Merge held entries back into the main priority queue. They'll be
    // ordered by rank during drain, so a Duke held during the round
    // still cuts the line at flush time.
    for (const q of held) queueRef.current.push(q);
    suppressedQueueRef.current = [];
    if (suppressedFlushTimerRef.current) {
      clearTimeout(suppressedFlushTimerRef.current);
      suppressedFlushTimerRef.current = null;
    }
    coalesceIfOverloaded();
    scheduleDrain();
  }

  const pushEntry = useCallback((params: PushEntryParams) => {
    if (!params?.userId) return;

    const now = Date.now();
    const lastSeen = userSeenRef.current.get(params.userId);
    const isFreshUser = !lastSeen || now - lastSeen > userDedupWindowMs;

    userSeenRef.current.set(params.userId, now);

    if (isFreshUser) {
      // Drop any already-queued entry for the same user (newer payload wins).
      queueRef.current = queueRef.current.filter(
        (q) => q.params.userId !== params.userId,
      );
      suppressedQueueRef.current = suppressedQueueRef.current.filter(
        (q) => q.params.userId !== params.userId,
      );

      const premiumHeld = suppressPremiumRef.current && hasPremium(params);

      if (premiumHeld) {
        // Park the premium portion; immediately play the lightweight
        // flying name bar (if any) via a stripped payload.
        suppressedQueueRef.current.push({
          params,
          rank: rankOf(params),
          enqueuedAt: now,
        });
        while (suppressedQueueRef.current.length > suppressedMaxQueue) {
          suppressedQueueRef.current.shift();
        }
        armSuppressedAutoFlush();

        const lite = stripPremium(params);
        if (lite.entryNameBarUrl) {
          queueRef.current.push({
            params: lite,
            rank: rankOf(lite),
            enqueuedAt: now,
          });
          coalesceIfOverloaded();
          scheduleDrain();
        }
      } else {
        queueRef.current.push({
          params,
          rank: rankOf(params),
          enqueuedAt: now,
        });
        coalesceIfOverloaded();
        scheduleDrain();
      }
    }
    // else: dedup window still active — silently swallow.

    // Phase 5: welcome chat coalescer fires on every fresh-user entry by
    // default, so individual call sites no longer need to thread state.
    const shouldWelcome =
      isFreshUser && (params.withWelcome || welcomeOnEveryEntry);
    if (shouldWelcome && coalescerRef.current && params.displayName) {
      coalescerRef.current.push({
        id: `welcome_${params.userId}_${now}`,
        userId: params.userId,
        userName: params.displayName,
        userLevel: params.level,
        avatarUrl: params.avatarUrl,
      });
    }
  }, [userDedupWindowMs, minEntryGapMs, premiumEntryGapMs, coalesceDepthThreshold, welcomeOnEveryEntry, suppressedAutoFlushMs, suppressedMaxQueue, inner]);


  const flushWelcome = useCallback(() => {
    coalescerRef.current?.flush();
  }, []);

  /**
   * Phase 4: host calls this at round end / `between_rounds` to release
   * any premium entries held while gameplay was active. Safe to call
   * even when nothing is held.
   */
  const flushSuppressed = useCallback(() => {
    flushSuppressedInternal('manual');
  }, []);

  /**
   * Phase 4: runtime toggle so a game panel can flip suppression on
   * `round_start` and off at `round_end`. Turning OFF automatically
   * flushes any held entries.
   */
  const setSuppressPremium = useCallback((on: boolean) => {
    suppressPremiumRef.current = on;
    if (!on) flushSuppressedInternal('manual');
  }, []);

  const forgetUser = useCallback((userId: string) => {
    userSeenRef.current.delete(userId);
    queueRef.current = queueRef.current.filter(
      (q) => q.params.userId !== userId,
    );
    suppressedQueueRef.current = suppressedQueueRef.current.filter(
      (q) => q.params.userId !== userId,
    );
  }, []);

  const clearAll = useCallback(() => {
    userSeenRef.current.clear();
    queueRef.current = [];
    suppressedQueueRef.current = [];
    if (drainTimerRef.current) {
      clearTimeout(drainTimerRef.current);
      drainTimerRef.current = null;
    }
    if (suppressedFlushTimerRef.current) {
      clearTimeout(suppressedFlushTimerRef.current);
      suppressedFlushTimerRef.current = null;
    }
    coalescerRef.current?.dispose();
    inner.clearAllAnimations();
  }, [inner]);

  // ---- Phase 6: global event bridge ----
  // Any component (game board, host control, moderation) can drive the
  // dispatcher without prop-drilling by firing window events scoped by
  // roomId. Also auto-forgets users on viewer/participant leave so the
  // counting + minus + re-entry welcome flows stay accurate across
  // live / audio party / video party / game party.
  useEffect(() => {
    if (!roomId) return;

    const matches = (detail: any): boolean => {
      if (!detail) return false;
      // accept either {roomId} or scoped LiveKit event payloads
      if (detail.roomId && detail.roomId === roomId) return true;
      if (detail.streamId && detail.streamId === roomId) return true;
      const p = detail.payload;
      if (p?.roomId && p.roomId === roomId) return true;
      if (p?.streamId && p.streamId === roomId) return true;
      return false;
    };

    const onSuppress = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!matches(d)) return;
      suppressPremiumRef.current = !!d.on;
      if (!d.on) flushSuppressedInternal('manual');
    };
    const onFlush = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!matches(d)) return;
      flushSuppressedInternal('manual');
    };
    const onForget = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!matches(d) || !d.userId) return;
      userSeenRef.current.delete(d.userId);
      queueRef.current = queueRef.current.filter((q) => q.params.userId !== d.userId);
      suppressedQueueRef.current = suppressedQueueRef.current.filter(
        (q) => q.params.userId !== d.userId,
      );
    };

    // Auto-forget on leave from existing LiveKit event channels so the
    // count/minus side of the system stays in lockstep with the entry side.
    const onLiveKitLeave = (evt: Event) => {
      const d = (evt as CustomEvent).detail;
      if (!matches(d)) return;
      const p = d?.payload;
      if (!p) return;
      if (p.type !== 'viewer_left' && p.type !== 'participant_left') return;
      if (!p.userId) return;
      userSeenRef.current.delete(p.userId);
      queueRef.current = queueRef.current.filter((q) => q.params.userId !== p.userId);
      suppressedQueueRef.current = suppressedQueueRef.current.filter(
        (q) => q.params.userId !== p.userId,
      );
    };

    window.addEventListener('entry-effects:suppress', onSuppress as EventListener);
    window.addEventListener('entry-effects:flush', onFlush as EventListener);
    window.addEventListener('entry-effects:forget-user', onForget as EventListener);
    window.addEventListener('livekit-live-event', onLiveKitLeave as EventListener);
    window.addEventListener('livekit-party-event', onLiveKitLeave as EventListener);

    return () => {
      window.removeEventListener('entry-effects:suppress', onSuppress as EventListener);
      window.removeEventListener('entry-effects:flush', onFlush as EventListener);
      window.removeEventListener('entry-effects:forget-user', onForget as EventListener);
      window.removeEventListener('livekit-live-event', onLiveKitLeave as EventListener);
      window.removeEventListener('livekit-party-event', onLiveKitLeave as EventListener);
    };
  }, [roomId]);

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
    flushSuppressed,
    setSuppressPremium,
    forgetUser,
    clearAll,
  }), [inner, pushEntry, flushWelcome, flushSuppressed, setSuppressPremium, forgetUser, clearAll]);
}


export default useUnifiedEntryDispatcher;
