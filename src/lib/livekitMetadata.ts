/**
 * Pkg107: LiveKit Participant & Room Metadata
 * --------------------------------------------------------------
 * LiveKit-native, server-persisted, auto-replicated string blob
 * attached to each Participant and to the Room itself. Used for
 * lightweight presence state (AFK, theme, role hint, mod flags)
 * that should follow the participant across reconnects.
 *
 * LiveKit-Purist:
 *  - Zero Supabase channels, zero polls, zero cross-user DB reads
 *  - SFU broadcasts changes via signaling; cost = free
 *  - Late-joiners receive current value on connect (SFU state)
 *
 * Wiring:
 *  - Producer: `setLocalParticipantMetadata(scope, id, json)` →
 *    serializes object to JSON and calls `LocalParticipant.setMetadata`.
 *    LiveKit Cloud requires this via server SDK or client w/ correct
 *    grant (`canUpdateOwnMetadata`); we use the latter (token grant
 *    already includes it in `livekit-token` edge fn).
 *  - Consumer: `useParticipantMetadata(scope, id, identity)` returns
 *    the parsed object for any participant in the bound Room.
 *
 * Listens to RoomEvent.ParticipantMetadataChanged on registered
 * Rooms and dispatches `livekit-participant-metadata` window events.
 */
import { Room, RoomEvent, type Participant } from 'livekit-client';
import { useEffect, useState } from 'react';

export type MetadataScope = 'call' | 'live' | 'party';

type Entry = { room: Room; cleanup: () => void };

const registry = new Map<string, Entry>(); // key = `${scope}:${id}`

function key(scope: MetadataScope, id: string) {
  return `${scope}:${id}`;
}

export interface ParticipantMetadataDetail {
  scope: MetadataScope;
  id: string;
  identity: string;
  metadata: Record<string, unknown> | null;
  raw: string | undefined;
}

function safeParse(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function dispatch(detail: ParticipantMetadataDetail) {
  try {
    window.dispatchEvent(new CustomEvent('livekit-participant-metadata', { detail }));
  } catch {
    /* SSR/test no-op */
  }
}

export function registerMetadataRoom(scope: MetadataScope, id: string, room: Room) {
  if (!id || !room) return;
  const k = key(scope, id);
  unregisterMetadataRoom(scope, id);

  const onChange = (_prev: string | undefined, participant: Participant) => {
    dispatch({
      scope,
      id,
      identity: participant.identity,
      metadata: safeParse(participant.metadata),
      raw: participant.metadata,
    });
  };

  room.on(RoomEvent.ParticipantMetadataChanged, onChange);

  // Seed: emit current values for already-connected remotes + local
  try {
    if (room.localParticipant) onChange(undefined, room.localParticipant);
    room.remoteParticipants.forEach((p) => onChange(undefined, p));
  } catch {
    /* ignore */
  }

  registry.set(k, {
    room,
    cleanup: () => {
      try {
        room.off(RoomEvent.ParticipantMetadataChanged, onChange);
      } catch {
        /* ignore */
      }
    },
  });
}

export function unregisterMetadataRoom(scope: MetadataScope, id: string) {
  const k = key(scope, id);
  const entry = registry.get(k);
  if (!entry) return;
  try {
    entry.cleanup();
  } catch {
    /* ignore */
  }
  registry.delete(k);
}

/**
 * Update the local participant's metadata in a bound Room.
 * Requires LiveKit grant `canUpdateOwnMetadata` (already in token).
 */
export async function setLocalParticipantMetadata(
  scope: MetadataScope,
  id: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  const entry = registry.get(key(scope, id));
  if (!entry) return false;
  const room = entry.room;
  if (!room || room.state !== 'connected') return false;
  try {
    const json = JSON.stringify(metadata ?? {});
    await room.localParticipant.setMetadata(json);
    return true;
  } catch (err) {
    console.warn('[Pkg107] setLocalParticipantMetadata failed:', err);
    return false;
  }
}

/**
 * Read current metadata for a specific participant identity, sync.
 */
export function readParticipantMetadata(
  scope: MetadataScope,
  id: string,
  identity: string,
): Record<string, unknown> | null {
  const entry = registry.get(key(scope, id));
  if (!entry) return null;
  const room = entry.room;
  if (!room) return null;
  if (room.localParticipant?.identity === identity) {
    return safeParse(room.localParticipant.metadata);
  }
  const remote = Array.from(room.remoteParticipants.values()).find(
    (p) => p.identity === identity,
  );
  return remote ? safeParse(remote.metadata) : null;
}

/**
 * React hook: live-subscribe to a participant's metadata.
 */
export function useParticipantMetadata(
  scope: MetadataScope,
  id: string | undefined,
  identity: string | undefined,
): Record<string, unknown> | null {
  const [meta, setMeta] = useState<Record<string, unknown> | null>(() =>
    scope && id && identity ? readParticipantMetadata(scope, id, identity) : null,
  );

  useEffect(() => {
    if (!scope || !id || !identity) {
      setMeta(null);
      return;
    }
    setMeta(readParticipantMetadata(scope, id, identity));

    const handler = (ev: Event) => {
      const d = (ev as CustomEvent<ParticipantMetadataDetail>).detail;
      if (!d || d.scope !== scope || d.id !== id) return;
      if (d.identity !== identity) return;
      setMeta(d.metadata);
    };
    window.addEventListener('livekit-participant-metadata', handler as EventListener);
    return () => {
      window.removeEventListener('livekit-participant-metadata', handler as EventListener);
    };
  }, [scope, id, identity]);

  return meta;
}

/** Test-only — clears the registry between specs. */
export function __resetMetadataRegistryForTests() {
  for (const [k] of registry) {
    const [scope, id] = k.split(':') as [MetadataScope, string];
    unregisterMetadataRoom(scope, id);
  }
}
