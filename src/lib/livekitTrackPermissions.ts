/**
 * Pkg105 — Track Subscription Permissions (LiveKit-native)
 *
 * Host can hard-block specific viewer identities from subscribing to their
 * published audio/video tracks at the SFU level. Blocked viewer's player
 * receives no media at all — defense-in-depth on top of UI hide / app-level
 * filter. Same pattern Bigo/Tango use for hard-block.
 *
 * - LiveKit-native: `localParticipant.setTrackSubscriptionPermissions(...)`.
 * - Zero new Supabase channels, zero polls.
 * - Identity matches the LiveKit token identity = Supabase user.id (see
 *   `supabase/functions/livekit-token/index.ts`).
 * - Idempotent: re-applies on every `ParticipantConnected` event so a newly
 *   joining blocked viewer is denied immediately.
 *
 * Usage:
 *   import { setHostBlocklist } from '@/lib/livekitTrackPermissions';
 *   setHostBlocklist('live', streamId, new Set(blockedUserIds));
 *
 * The host's LiveKit Room is registered automatically by the existing
 * `useLiveKitClient` (live), `useLiveKitCall` (call), and `usePartyRoomNativeLiveKit`
 * (party) hooks through `registerTrackPermissionRoom(scope, id, room)`.
 */

import type { Room } from 'livekit-client';

type Scope = 'live' | 'call' | 'party';

type Mode = 'blocklist' | 'allowlist';

type Entry = {
  room: Room;
  /** Identities to *deny* (blocklist mode) or *allow* (allowlist mode). */
  blocked: Set<string>;
  mode: Mode;
  /** Pkg193 — restrict to specific track sources, e.g. allow audio but deny video. */
  allowedTrackSids?: string[];
  off?: () => void;
};

const registry = new Map<string, Entry>();
const keyOf = (scope: Scope, id: string) => `${scope}:${id}`;

function applyPermissions(entry: Entry) {
  try {
    const lp: any = entry.room?.localParticipant;
    if (!lp?.setTrackSubscriptionPermissions) return;

    if (entry.mode === 'allowlist') {
      // Pkg193 — VIP-only / private-room mode: everyone DENIED by default;
      // listed identities are explicit grants.
      const granted = Array.from(entry.blocked).map((identity) => ({
        participantIdentity: identity,
        allowAll: !entry.allowedTrackSids,
        allowedTrackSids: entry.allowedTrackSids,
      }));
      lp.setTrackSubscriptionPermissions(false, granted);
      return;
    }

    // Default blocklist mode: everyone allowed; listed identities denied.
    const denied = Array.from(entry.blocked).map((identity) => ({
      participantIdentity: identity,
      allowAll: false,
    }));
    lp.setTrackSubscriptionPermissions(true, denied);
  } catch (e) {
    console.warn('[TrackPermissions] applyPermissions failed (non-fatal):', e);
  }
}

export function registerTrackPermissionRoom(scope: Scope, id: string, room: Room | null | undefined) {
  if (!room || !id) return () => {};
  const key = keyOf(scope, id);

  // If already registered with same room, just return existing teardown.
  const existing = registry.get(key);
  if (existing && existing.room === room) {
    return () => unregister(scope, id);
  }
  // Different room → unregister old first.
  if (existing) existing.off?.();

  const entry: Entry = {
    room,
    blocked: existing?.blocked ?? new Set(),
    mode: existing?.mode ?? 'blocklist',
    allowedTrackSids: existing?.allowedTrackSids,
  };

  // Re-apply when a participant joins (could be a blocked viewer).
  const handler = () => applyPermissions(entry);
  try {
    // 'participantConnected' RoomEvent — using string to avoid pulling enum.
    (room as any).on?.('participantConnected', handler);
    entry.off = () => {
      try { (room as any).off?.('participantConnected', handler); } catch { /* noop */ }
    };
  } catch { /* noop */ }

  registry.set(key, entry);

  // Apply current blocklist immediately.
  applyPermissions(entry);

  return () => unregister(scope, id);
}

export function unregister(scope: Scope, id: string) {
  const key = keyOf(scope, id);
  const e = registry.get(key);
  if (!e) return;
  e.off?.();
  registry.delete(key);
}

/** Replace the blocked-identity set and immediately push to the SFU. */
export function setHostBlocklist(scope: Scope, id: string, blocked: Set<string>) {
  const key = keyOf(scope, id);
  const e = registry.get(key);
  if (!e) {
    registry.set(key, { room: null as any, blocked: new Set(blocked), mode: 'blocklist' });
    return;
  }
  e.blocked = new Set(blocked);
  e.mode = 'blocklist';
  if (e.room) applyPermissions(e);
}

export function addToHostBlocklist(scope: Scope, id: string, identity: string) {
  const key = keyOf(scope, id);
  const e = registry.get(key);
  if (!e) {
    registry.set(key, { room: null as any, blocked: new Set([identity]), mode: 'blocklist' });
    return;
  }
  e.blocked.add(identity);
  if (e.room) applyPermissions(e);
}

export function removeFromHostBlocklist(scope: Scope, id: string, identity: string) {
  const key = keyOf(scope, id);
  const e = registry.get(key);
  if (!e) return;
  e.blocked.delete(identity);
  if (e.room) applyPermissions(e);
}

// ─── Pkg193 — Allowlist mode (Item #5, sub-participant advanced control) ─

/**
 * Switch to allowlist mode: deny ALL viewers from subscribing to the host's
 * tracks except the listed identities. Use for private/VIP-only rooms.
 *
 * @param allowedTrackSids Optional — restrict grant to specific track SIDs
 *   (e.g. only allow audio, deny video). Pass `undefined` to grant all.
 */
export function setHostAllowlist(
  scope: Scope,
  id: string,
  allowed: Set<string>,
  allowedTrackSids?: string[],
) {
  const key = keyOf(scope, id);
  const e = registry.get(key);
  if (!e) {
    registry.set(key, {
      room: null as any,
      blocked: new Set(allowed),
      mode: 'allowlist',
      allowedTrackSids,
    });
    return;
  }
  e.blocked = new Set(allowed);
  e.mode = 'allowlist';
  e.allowedTrackSids = allowedTrackSids;
  if (e.room) applyPermissions(e);
}

/** Reset to default-open: everyone allowed, no overrides. */
export function clearHostPermissions(scope: Scope, id: string) {
  const key = keyOf(scope, id);
  const e = registry.get(key);
  if (!e) return;
  e.blocked = new Set();
  e.mode = 'blocklist';
  e.allowedTrackSids = undefined;
  if (e.room) applyPermissions(e);
}

export const __test = { registry, applyPermissions, keyOf };
