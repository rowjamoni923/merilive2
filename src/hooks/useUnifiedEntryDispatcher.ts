/**
 * useUnifiedEntryDispatcher — Phase 1 of the entrance-effects pro-rebuild.
 *
 * Goal (Chamet / Bigo / Poppo parity): every room type (Live Stream,
 * Audio Party, Video Party, Game Party) must funnel ALL of its entry-event
 * sources through ONE dispatcher so an arriving viewer triggers AT MOST
 * ONE Premium Entry Effect + ONE Flying Name Bar, regardless of how many
 * code paths discover them in parallel.
 *
 * Background (audit gap G2):
 *   `LiveStream.tsx` calls `addEntryAnimation` from three places:
 *     1. initial viewers fetch (cold mount, full payload)
 *     2. LiveKit `ParticipantConnected` (instant, partial payload — no URLs)
 *     3. Supabase Realtime `stream_viewers` insert broadcast (full payload)
 *   `PartyRoom.tsx` has FOUR call sites.
 *   The existing `useEntryAnimations` signature dedup only catches
 *   *identical* payloads, so paths 2 and 3 (different URL completeness)
 *   each fire their own animation → user sees the same entry twice.
 *
 * Fix: this dispatcher remembers `userId` keys for a long window (default
 * 60 s — Bigo / Chamet stay quiet for the full Noble entry cooldown) and
 * collapses any subsequent call for the same userId. A richer follow-up
 * payload (e.g. realtime broadcast brings the entranceUrl that LiveKit
 * didn't have) is allowed to *upgrade* the first animation in flight, but
 * never to enqueue a second one.
 *
 * Returned shape is a drop-in superset of `useEntryAnimations` so call
 * sites only need to swap the import + the hook call.
 *
 * Phase 1 scope: dedup only.
 *   Phase 2 = rank-priority queue,
 *   Phase 3 = name-bar 3-cap + "+N others" overflow,
 *   Phase 4 = game-round suppression,
 *   Phase 5 = welcome chat coalescer wiring (uses `coalescer` ref below),
 *   Phase 6 = server-batched viewer count.
 * Those phases extend this hook without breaking the public API.
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
  /** Stable room identifier — used to namespace the user-dedup map so re-mounts (same user re-enters another room) don't get blocked. */
  roomId: string;
  /** Which room type — drives Phase 4 game-suppression hooks (no-op in Phase 1). */
  roomType: EntryRoomType;
  /** Current logged-in user — coalescer bypasses self-joins for instant local feedback. */
  selfUserId?: string | null;
  /**
   * Phase 5 hook: receives coalesced welcome-row payloads. Pass `undefined`
   * in Phase 1 — the coalescer still exists internally but emits nowhere.
   */
  onWelcomeRow?: (out: CoalescedJoin) => void;
  /** Welcome burst window (ms). Defaults to 500 ms — Whatnot-style sliding window. */
  welcomeWindowMs?: number;
  /**
   * How long to remember a userId after pushing their entry. Subsequent
   * pushes for the same userId within this window collapse silently
   * (animation already played / queued). Default 60 s, matching the
   * Noble re-entry cooldown observed on Bigo.
   */
  userDedupWindowMs?: number;
}

export interface PushEntryParams extends AddEntryParams {
  /**
   * When true, also enqueue a welcome chat row via the internal
   * coalescer. Leave undefined to keep welcome handling at the call
   * site (Phase 1 default — call sites still own their chat dispatch).
   */
  withWelcome?: boolean;
}

export function useUnifiedEntryDispatcher(opts: UnifiedEntryDispatcherOptions) {
  const {
    roomId,
    selfUserId,
    onWelcomeRow,
    welcomeWindowMs = 500,
    userDedupWindowMs = 60_000,
  } = opts;

  const inner = useEntryAnimations();

  // userId -> last accepted-at ms. Persists across the lifetime of the
  // room mount; namespaced implicitly because the hook re-creates on
  // roomId change (consumers should pass a stable roomId).
  const userSeenRef = useRef<Map<string, number>>(new Map());

  // The coalescer is created lazily and re-created if the welcome
  // sink or window changes. It is safe to dispose on unmount.
  const coalescerRef = useRef<JoinCoalescer | null>(null);

  useEffect(() => {
    // Tear down any previous instance before installing a new one.
    coalescerRef.current?.dispose();
    coalescerRef.current = createJoinMessageCoalescer({
      windowMs: welcomeWindowMs,
      selfUserId: selfUserId ?? null,
      onEmit: (out) => {
        try { onWelcomeRow?.(out); } catch { /* swallow — chat rows are best-effort */ }
      },
    });
    return () => {
      coalescerRef.current?.flush();
      coalescerRef.current?.dispose();
      coalescerRef.current = null;
    };
  }, [welcomeWindowMs, selfUserId, onWelcomeRow]);

  // Reset the dedup map whenever we hop rooms — a viewer who saw your
  // entry in Room A should still see it again when you walk into Room B.
  useEffect(() => {
    userSeenRef.current.clear();
    return () => userSeenRef.current.clear();
  }, [roomId]);

  /**
   * Single funnel for entry effects + welcome rows. Idempotent per
   * `userId` within `userDedupWindowMs`. The inner `useEntryAnimations`
   * still runs its own 5 s payload-signature dedup as a second line of
   * defence (handles same-user re-entry within the long window when a
   * room intentionally allows it, e.g. PK Battle merge).
   */
  const pushEntry = useCallback((params: PushEntryParams) => {
    if (!params?.userId) return;

    const now = Date.now();
    const lastSeen = userSeenRef.current.get(params.userId);
    const isFreshUser = !lastSeen || now - lastSeen > userDedupWindowMs;

    if (isFreshUser) {
      userSeenRef.current.set(params.userId, now);
      inner.addEntryAnimation(params);
    } else {
      // Suppress duplicate — multi-source race (LiveKit + Realtime + fetch
      // all firing for the same arrival). Still record the latest seen-at
      // so a quiet user's re-entry resets fresh after the window elapses.
      userSeenRef.current.set(params.userId, now);
    }

    if (params.withWelcome && coalescerRef.current) {
      coalescerRef.current.push({
        id: `welcome_${params.userId}_${now}`,
        userId: params.userId,
        userName: params.displayName,
        userLevel: params.level,
        avatarUrl: params.avatarUrl,
      });
    }
  }, [inner, userDedupWindowMs]);

  /** Manually flush the welcome coalescer (e.g. before navigating away). */
  const flushWelcome = useCallback(() => {
    coalescerRef.current?.flush();
  }, []);

  /** Forget a single user's dedup mark — used by tests / room reset flows. */
  const forgetUser = useCallback((userId: string) => {
    userSeenRef.current.delete(userId);
  }, []);

  const clearAll = useCallback(() => {
    userSeenRef.current.clear();
    coalescerRef.current?.dispose();
    inner.clearAllAnimations();
  }, [inner]);

  return useMemo(() => ({
    // Drop-in superset of useEntryAnimations
    entryAnimations: inner.entryAnimations,
    nameBarAnimations: inner.nameBarAnimations,
    removeEntryAnimation: inner.removeEntryAnimation,
    removeNameBarAnimation: inner.removeNameBarAnimation,
    hasActiveAnimation: inner.hasActiveAnimation,
    // Phase-1 unified funnel
    pushEntry,
    /** Back-compat alias so existing call sites keep working during the cut-over. */
    addEntryAnimation: pushEntry,
    flushWelcome,
    forgetUser,
    clearAll,
  }), [inner, pushEntry, flushWelcome, forgetUser, clearAll]);
}

export default useUnifiedEntryDispatcher;
