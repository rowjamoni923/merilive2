/**
 * Pkg77: Instant viewer count via LiveKit `ParticipantConnected/Disconnected`.
 *
 * The host (and every viewer) is already connected to the same LiveKit Room
 * for media. LiveKit fires participant events with sub-50ms latency — far
 * faster than the previous `stream_viewers` postgres_changes path which had
 * to round-trip the DB + Realtime publication.
 *
 * This module piggy-backs on the EXISTING Room — it never opens a new
 * Supabase channel, never adds a setInterval, never reads `profiles`.
 *
 * Persistence (entrance banner / recent-viewers history / level credit) stays
 * on Supabase `stream_viewers` rows — those are required for durable state.
 * Only the **count badge** is sped up here.
 *
 * Cost guards:
 *  - NO Supabase Realtime channels.
 *  - NO polling / setInterval.
 *  - NO cross-user profile reads.
 *  - Kill-switch: `app_settings.livekit_signaling_enabled.live` (reuses
 *    the live family — Pkg77 is part of the live stream experience).
 */
import { Room, RoomEvent, type RemoteParticipant } from 'livekit-client';
import { isLiveKitEnabled } from './livekitSignaling';

export interface ViewerCountDetail {
  streamId: string;
  count: number;
}

interface Entry {
  room: Room;
  onJoin: (p: RemoteParticipant) => void;
  onLeave: (p: RemoteParticipant) => void;
  onConn: () => void;
}

// streamId → Room + listeners
const registry = new Map<string, Entry>();

function dispatch(streamId: string, count: number) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ViewerCountDetail>('livekit-viewer-count', {
      detail: { streamId, count: Math.max(0, count) },
    }),
  );
}

function isRemoteHost(participant: unknown): boolean {
  const raw = (participant as { metadata?: string | null } | null)?.metadata;
  if (!raw) return false;
  try {
    const meta = JSON.parse(raw);
    return meta?.appRole === 'host' || meta?.roomType === 'host_stream';
  } catch {
    return false;
  }
}

function currentCount(room: Room): number {
  // remoteParticipants does not include the local participant. Count only
  // non-host remotes so PK/co-host rooms don't add the other host(s) to the
  // viewer badge. Callers that need a total people count add the local user.
  try {
    return Array.from(room.remoteParticipants?.values?.() ?? []).filter((p) => !isRemoteHost(p)).length;
  } catch {
    return 0;
  }
}

export function registerViewerCountRoom(
  streamId: string | null | undefined,
  room: Room | null | undefined,
) {
  if (!streamId || !room) return;
  unregisterViewerCountRoom(streamId);

  const emit = () => dispatch(streamId, currentCount(room));

  const onJoin = (_p: RemoteParticipant) => emit();
  const onLeave = (_p: RemoteParticipant) => emit();
  const onConn = () => emit();

  try {
    room.on(RoomEvent.ParticipantConnected, onJoin);
    room.on(RoomEvent.ParticipantDisconnected, onLeave);
    room.on(RoomEvent.Connected, onConn);
  } catch {
    return;
  }

  registry.set(streamId, { room, onJoin, onLeave, onConn });

  // Fire once immediately so the badge gets the current snapshot.
  emit();

  // Light async kill-switch check — purely informational; the count is cheap
  // and safe even when "live" is disabled (no DataPackets are involved).
  isLiveKitEnabled('live').catch(() => {});
}

export function unregisterViewerCountRoom(streamId: string | null | undefined) {
  if (!streamId) return;
  const entry = registry.get(streamId);
  if (!entry) return;
  try {
    entry.room.off(RoomEvent.ParticipantConnected, entry.onJoin);
    entry.room.off(RoomEvent.ParticipantDisconnected, entry.onLeave);
    entry.room.off(RoomEvent.Connected, entry.onConn);
  } catch {
    // room may already be disconnected
  }
  registry.delete(streamId);
}

/** Read the current LiveKit-derived viewer count for a stream (sync). */
export function getLiveKitViewerCount(streamId: string | null | undefined): number {
  if (!streamId) return 0;
  const entry = registry.get(streamId);
  if (!entry) return 0;
  return currentCount(entry.room);
}

/** Test-only — clears the registry between specs. */
export function __resetViewerCountRegistryForTests() {
  for (const [id] of registry) unregisterViewerCountRoom(id);
}
