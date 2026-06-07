/**
 * Pkg438 Phase B3 — Welcome chat message burst-coalescer.
 *
 * When N users join a room within a short window (e.g. someone shares the
 * room link and 8 viewers tap-through at once), industry apps (Chamet/BIGO)
 * collapse the chat-side "X joined" rows into a single
 * "Alice + 7 others joined" row instead of spamming the chat panel.
 *
 * IMPORTANT scope:
 *   - This coalescer ONLY affects the chat-row welcome message.
 *   - Full-screen Premium Entry Effects, Vehicle Entrances and Flying Name
 *     Bars stay 1:1 (users paid for those — they MUST play individually).
 *   - The native gift/entry dispatchers (Pkg438 Phase B) are untouched.
 *
 * Algorithm:
 *   - Buffer incoming join entries for `windowMs` (default 500ms).
 *   - On flush, if size === 1 → emit single ("Alice joined ✨").
 *   - If size >= 2 → emit one coalesced row with the highest-level user
 *     as the "face" + "+N others joined ✨".
 *   - Self-joins are never coalesced (always emit immediately) so the
 *     local user gets instant feedback.
 *
 * Usage:
 *   const coalescer = createJoinMessageCoalescer({
 *     selfUserId: currentUserId,
 *     onEmit: (entry) => appendChatRow(entry),
 *   });
 *   coalescer.push({ id, userId, userName, userLevel, avatarUrl });
 *   // ...on unmount:
 *   coalescer.flush();
 *   coalescer.dispose();
 */

export interface JoinEntry {
  id: string;
  userId: string;
  userName: string;
  userLevel?: number;
  avatarUrl?: string;
}

export interface CoalescedJoin {
  id: string;
  primary: JoinEntry;
  othersCount: number; // 0 when only one user joined in the window
}

export interface JoinCoalescerOptions {
  windowMs?: number;
  selfUserId?: string | null;
  onEmit: (out: CoalescedJoin) => void;
}

export interface JoinCoalescer {
  push: (entry: JoinEntry) => void;
  flush: () => void;
  dispose: () => void;
}

export function createJoinMessageCoalescer(
  opts: JoinCoalescerOptions,
): JoinCoalescer {
  const windowMs = Math.max(100, Math.min(2000, opts.windowMs ?? 500));
  let buffer: JoinEntry[] = [];
  const seen = new Set<string>(); // userId-dedupe within the window
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!buffer.length) return;
    const batch = buffer;
    buffer = [];
    seen.clear();

    if (batch.length === 1) {
      opts.onEmit({ id: batch[0].id, primary: batch[0], othersCount: 0 });
      return;
    }
    // Pick highest-level user as the public "face" of the burst.
    const primary = batch.reduce(
      (best, cur) =>
        (cur.userLevel ?? 0) > (best.userLevel ?? 0) ? cur : best,
      batch[0],
    );
    opts.onEmit({
      id: `joinburst-${primary.id}`,
      primary,
      othersCount: batch.length - 1,
    });
  };

  const push = (entry: JoinEntry) => {
    if (disposed || !entry?.userId) return;

    // Self-joins bypass the buffer for instant local feedback.
    if (opts.selfUserId && entry.userId === opts.selfUserId) {
      opts.onEmit({ id: entry.id, primary: entry, othersCount: 0 });
      return;
    }

    // Dedupe identical userIds inside the same burst window.
    if (seen.has(entry.userId)) return;
    seen.add(entry.userId);
    buffer.push(entry);

    if (!timer) timer = setTimeout(flush, windowMs);
  };

  const dispose = () => {
    disposed = true;
    if (timer) { clearTimeout(timer); timer = null; }
    buffer = [];
    seen.clear();
  };

  return { push, flush, dispose };
}

/**
 * Convenience formatter — returns the public chat-row text for a coalesced
 * or single join entry. Keep English-only (project rule).
 */
export function formatJoinMessage(out: CoalescedJoin): string {
  if (out.othersCount <= 0) return 'joined the room ✨';
  if (out.othersCount === 1) return 'and 1 other joined the room ✨';
  return `and ${out.othersCount} others joined the room ✨`;
}
