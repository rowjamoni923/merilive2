/**
 * Pkg192 — LiveKit Participant Attributes (Item #4 of 12).
 *
 * Wraps LiveKit's server-tracked per-participant attribute system:
 *   - `localParticipant.setAttributes({ k: v })` merges into the participant's
 *     attribute map; the server fans the diff out as `AttributesChanged` to
 *     every other participant in the room and includes the full map on each
 *     remote participant's `.attributes` property.
 *   - Unlike DataPackets, attributes are persisted on the server for the
 *     lifetime of the participant (so late-joiners see them automatically),
 *     and the server enforces a 1KB total cap per participant.
 *
 * Reuses the Pkg121 scope/id registry (no second wiring needed; all 4 connect
 * sites already call `registerStreamRoom`).
 *
 * Use cases for our app:
 *   - Broadcast a host's current Level / VIP tier / role to viewers without
 *     a Supabase round-trip on join.
 *   - "Hand raised", "mic muted by mod", "PK active" flags that survive late
 *     viewer joins (vs. fire-and-forget DataPackets).
 *   - Co-host badges, language, region — anything that's small, slow-changing
 *     and per-participant.
 *
 * Constraints honored:
 *   - No Supabase Realtime channels, no polling.
 *   - 1 KB cap is enforced by the server; we warn on > 800B locally.
 *   - Receivers register a callback that fires for every remote participant's
 *     attribute change AND once per existing participant on subscribe (so the
 *     UI doesn't need a separate "initial fetch" path).
 */
import { useEffect, useState } from 'react';
import {
  RoomEvent,
  ParticipantEvent,
  type RemoteParticipant,
  type Participant,
} from 'livekit-client';
import { _getRegisteredRoom, type StreamScope } from './livekitStreams';

export interface ParticipantAttributesSnapshot {
  identity: string;
  attributes: Record<string, string>;
}

const SOFT_CAP_BYTES = 800; // server hard cap is 1024; warn early.

/**
 * Set/merge attributes on the local participant. Pass `null` as a value to
 * delete that key. Throws if the room isn't registered yet.
 */
export async function setLocalAttributes(
  scope: StreamScope,
  id: string,
  attrs: Record<string, string | null>,
): Promise<void> {
  const room = _getRegisteredRoom(scope, id);
  if (!room) throw new Error('room_not_registered');

  // Build the diff: LiveKit's setAttributes treats undefined as "leave alone"
  // and empty-string as "delete" in newer client versions.
  const payload: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    payload[k] = v == null ? '' : String(v);
  }

  try {
    const approxBytes = new Blob([JSON.stringify({
      ...(room.localParticipant.attributes ?? {}),
      ...payload,
    })]).size;
    if (approxBytes > SOFT_CAP_BYTES) {
      console.warn(
        `[Pkg192] participant attributes ~${approxBytes}B approaching 1KB cap`,
      );
    }
  } catch {
    /* size check is best-effort */
  }

  await room.localParticipant.setAttributes(payload);
}

/** Read the current attribute map for a remote participant (or local). */
export function getParticipantAttributes(
  scope: StreamScope,
  id: string,
  identity: string,
): Record<string, string> | null {
  const room = _getRegisteredRoom(scope, id);
  if (!room) return null;
  if (room.localParticipant.identity === identity) {
    return { ...(room.localParticipant.attributes ?? {}) };
  }
  const remote = room.remoteParticipants.get(identity);
  return remote ? { ...(remote.attributes ?? {}) } : null;
}

/** Read attributes for every participant currently in the room. */
export function getAllParticipantAttributes(
  scope: StreamScope,
  id: string,
): ParticipantAttributesSnapshot[] {
  const room = _getRegisteredRoom(scope, id);
  if (!room) return [];
  const out: ParticipantAttributesSnapshot[] = [
    {
      identity: room.localParticipant.identity,
      attributes: { ...(room.localParticipant.attributes ?? {}) },
    },
  ];
  room.remoteParticipants.forEach((p) => {
    out.push({ identity: p.identity, attributes: { ...(p.attributes ?? {}) } });
  });
  return out;
}

/**
 * Subscribe to attribute changes for every participant in a room. The
 * callback fires:
 *   - immediately once per existing participant (initial sync)
 *   - on `ParticipantAttributesChanged` for any participant (incl. local)
 *   - on `ParticipantConnected` / `Disconnected` so callers can prune state
 *
 * Returns a dispose function.
 */
export function subscribeParticipantAttributes(
  scope: StreamScope,
  id: string,
  onChange: (snap: ParticipantAttributesSnapshot, removed?: boolean) => void,
): () => void {
  const room = _getRegisteredRoom(scope, id);
  if (!room) {
    console.warn(`[Pkg192] subscribeParticipantAttributes: room not registered for ${scope}:${id}`);
    return () => {};
  }

  // Initial sync.
  for (const snap of getAllParticipantAttributes(scope, id)) {
    onChange(snap);
  }

  const emit = (p: Participant) => {
    onChange({ identity: p.identity, attributes: { ...(p.attributes ?? {}) } });
  };

  const onAttrChanged = (_changed: Record<string, string>, p: Participant) => emit(p);
  const onConnected = (p: RemoteParticipant) => {
    emit(p);
    p.on(ParticipantEvent.AttributesChanged, (changed) => onAttrChanged(changed, p));
  };
  const onDisconnected = (p: RemoteParticipant) => {
    onChange({ identity: p.identity, attributes: {} }, true);
  };

  room.on(RoomEvent.ParticipantAttributesChanged, onAttrChanged);
  room.on(RoomEvent.ParticipantConnected, onConnected);
  room.on(RoomEvent.ParticipantDisconnected, onDisconnected);

  // Local participant emits via ParticipantEvent.AttributesChanged directly.
  const localHandler = (changed: Record<string, string>) =>
    onAttrChanged(changed, room.localParticipant);
  room.localParticipant.on(ParticipantEvent.AttributesChanged, localHandler);

  // Existing remotes — attach per-participant listener for completeness.
  const perRemote = new Map<string, (c: Record<string, string>) => void>();
  room.remoteParticipants.forEach((p) => {
    const h = (changed: Record<string, string>) => onAttrChanged(changed, p);
    p.on(ParticipantEvent.AttributesChanged, h);
    perRemote.set(p.identity, h);
  });

  return () => {
    try {
      room.off(RoomEvent.ParticipantAttributesChanged, onAttrChanged);
      room.off(RoomEvent.ParticipantConnected, onConnected);
      room.off(RoomEvent.ParticipantDisconnected, onDisconnected);
      room.localParticipant.off(ParticipantEvent.AttributesChanged, localHandler);
      perRemote.forEach((h, ident) => {
        const p = room.remoteParticipants.get(ident);
        p?.off(ParticipantEvent.AttributesChanged, h);
      });
    } catch {
      /* ignore */
    }
  };
}

/**
 * React hook — returns a live identity→attributes map for the given room.
 * Auto-resubscribes when scope/id change. Returns `{}` while the room isn't
 * registered.
 */
export function useParticipantAttributes(
  scope: StreamScope | null | undefined,
  id: string | null | undefined,
): Record<string, Record<string, string>> {
  const [map, setMap] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    if (!scope || !id) {
      setMap({});
      return;
    }
    // Reset whenever scope/id changes.
    setMap({});
    const dispose = subscribeParticipantAttributes(scope, id, (snap, removed) => {
      setMap((prev) => {
        if (removed) {
          if (!(snap.identity in prev)) return prev;
          const next = { ...prev };
          delete next[snap.identity];
          return next;
        }
        return { ...prev, [snap.identity]: snap.attributes };
      });
    });
    return dispose;
  }, [scope, id]);

  return map;
}
