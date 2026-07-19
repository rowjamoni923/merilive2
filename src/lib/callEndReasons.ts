/**
 * Canonical end-reason enum for private calls.
 *
 * Historically the codebase used a fluid mix of strings — 'normal',
 * 'declined', 'missed', 'insufficient_diamonds', 'insufficient_balance',
 * 'Insufficient balance', 'network', 'user_hangup', 'remote_close',
 * 'force_end', 'busy', 'timeout', 'cancelled' — written from JS, Android,
 * edge functions and DB triggers. CallEndedModal could only render four
 * of them; everything else was silently shown as "normal".
 *
 * This module gives us:
 *   - `CALL_END_REASONS` — the canonical, professional set (Chamet/Bigo/Olamet
 *     standard taxonomy translated to our LiveKit stack).
 *   - `normalizeEndReason()` — maps any legacy spelling to the canonical
 *     enum, so a single switch in the UI handles every historical row.
 *   - `endReasonAllowsRating()` — true only for clean ends that should
 *     trigger the post-call rating prompt (industry: only `normal`).
 */

export const CALL_END_REASONS = [
  'normal',       // clean hang-up by either side
  'declined',     // host explicitly declined the ring
  'missed',       // ring timed out without a decision
  'cancelled',    // caller cancelled before host answered
  'low_balance',  // caller wallet hit 0, server force-ended
  'network',      // LiveKit reconnect budget exhausted
  'busy',         // host already in another call / session
  'blocked',      // blocked relationship between participants
  'unknown',      // fallback for genuinely unmappable strings
] as const;

export type CallEndReason = typeof CALL_END_REASONS[number];

export function isCallEndReason(value: unknown): value is CallEndReason {
  return typeof value === 'string'
    && (CALL_END_REASONS as readonly string[]).includes(value);
}

/**
 * Map any historical / legacy / language-variant string to the canonical
 * enum. Comparison is case-insensitive and ignores leading/trailing
 * whitespace. Returns `'unknown'` for genuinely unrecognised input — never
 * `null`, so consumers always have a valid enum member to switch on.
 */
export function normalizeEndReason(raw: unknown): CallEndReason {
  if (raw == null) return 'unknown';
  const s = String(raw).trim().toLowerCase();
  if (!s) return 'unknown';

  // Direct hits on the canonical set.
  if ((CALL_END_REASONS as readonly string[]).includes(s)) {
    return s as CallEndReason;
  }

  // Insufficient balance — historically three spellings.
  if (s === 'insufficient_balance'
   || s === 'insufficient balance'
   || s === 'insufficient_diamonds'
   || s === 'insufficient diamonds'
   || s === 'low_balance'
   || s === 'force_end'             // server force-ends are almost always low-balance
   || s === 'insufficient'
  ) {
    return 'low_balance';
  }

  // Caller hung up before host picked up.
  if (s === 'caller_cancelled' || s === 'caller-cancelled' || s === 'aborted') {
    return 'cancelled';
  }

  // Local user hang-up (either side) is a clean normal end.
  if (s === 'user_hangup' || s === 'hangup' || s === 'remote_close' || s === 'ended') {
    return 'normal';
  }

  // Ring timeout.
  if (s === 'timeout' || s === 'ring_timeout' || s === 'no_answer' || s === 'not_answered') {
    return 'missed';
  }

  // Network drop.
  if (s === 'network_lost' || s === 'connection_lost' || s === 'disconnected') {
    return 'network';
  }

  return 'unknown';
}

/**
 * Industry pattern: only clean `normal` ends should prompt the post-call
 * rating modal. Declined / missed / cancelled / low_balance / network ends
 * are noisy and would otherwise tank average ratings unfairly.
 */
export function endReasonAllowsRating(reason: CallEndReason | string | null | undefined): boolean {
  return normalizeEndReason(reason) === 'normal';
}

/**
 * Short human-readable label per canonical reason. UI may override for
 * localisation, but this keeps every consumer in sync by default.
 */
export function endReasonLabel(reason: CallEndReason | string | null | undefined): string {
  switch (normalizeEndReason(reason)) {
    case 'normal':      return 'Call Ended';
    case 'declined':    return 'Call Declined';
    case 'missed':      return 'Call Missed';
    case 'cancelled':   return 'Call Cancelled';
    case 'low_balance': return 'Insufficient Balance';
    case 'network':     return 'Connection Lost';
    case 'busy':        return 'User Busy';
    case 'blocked':     return 'Call Blocked';
    case 'unknown':
    default:            return 'Call Ended';
  }
}
