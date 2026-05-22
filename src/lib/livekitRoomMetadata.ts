/**
 * Pkg122: Room-level Metadata over LiveKit
 *
 * Wraps `RoomEvent.RoomMetadataChanged` (read side) + edge-fn calling
 * `RoomServiceClient.updateRoomMetadata` (write side). Lets host/admin
 * broadcast a single shared room state blob (current song, poll state,
 * theme, pinned chat, AFK announcement, etc.) to ALL participants —
 * persisted by the LiveKit SFU so late-joiners get it for free.
 *
 * Pairs with Pkg107 (per-participant metadata). Use room metadata for
 * room-wide state, per-participant metadata for per-user state.
 *
 * - NO Supabase Realtime channels, NO polls, NO cross-user DB reads.
 * - Kill-switch: app_settings.livekit_signaling_enabled.room_metadata
 *   (default OFF — explicit opt-in, since the edge fn mutates SFU state).
 * - Reads always work; only the `setRoomMetadata` write is gated.
 */
import type { Room } from 'livekit-client';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type RoomMetadataScope = 'call' | 'live' | 'party';

interface RegEntry {
  room: Room;
  onChange: (md: string) => void;
}

const registry = new Map<string, RegEntry>();
const key = (scope: RoomMetadataScope, id: string) => `${scope}:${id}`;

export interface RoomMetadataEventDetail {
  scope: RoomMetadataScope;
  id: string;
  /** Raw string blob from LiveKit (may be empty). */
  raw: string;
  /** Parsed object if `raw` was valid JSON, else null. */
  metadata: Record<string, unknown> | null;
}

function emit(scope: RoomMetadataScope, id: string, raw: string) {
  let parsed: Record<string, unknown> | null = null;
  if (raw) {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') parsed = obj as Record<string, unknown>;
    } catch {
      /* non-JSON metadata is allowed; parsed stays null */
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<RoomMetadataEventDetail>('livekit-room-metadata', {
        detail: { scope, id, raw, metadata: parsed },
      }),
    );
  }
}

export function registerRoomMetadataRoom(scope: RoomMetadataScope, id: string, room: Room) {
  if (!room) return;
  const k = key(scope, id);
  const existing = registry.get(k);
  if (existing && existing.room === room) return;
  if (existing && existing.room !== room) {
    try {
      existing.room.off?.('roomMetadataChanged' as any, existing.onChange);
    } catch {
      /* ignore */
    }
  }
  const onChange = (md: string) => emit(scope, id, md ?? '');
  registry.set(k, { room, onChange });
  try {
    room.on('roomMetadataChanged' as any, onChange);
  } catch (err) {
    console.warn(`[Pkg122] registerRoomMetadataRoom(${scope}:${id}) failed`, err);
  }
  // Emit current value once for late subscribers.
  try {
    if (typeof (room as any).metadata === 'string') emit(scope, id, (room as any).metadata);
  } catch {
    /* ignore */
  }
}

export function unregisterRoomMetadataRoom(scope: RoomMetadataScope, id: string) {
  const k = key(scope, id);
  const entry = registry.get(k);
  if (!entry) return;
  try {
    entry.room.off?.('roomMetadataChanged' as any, entry.onChange);
  } catch {
    /* ignore */
  }
  registry.delete(k);
}

/** Read the current cached metadata for a registered Room (sync). */
export function readRoomMetadata(
  scope: RoomMetadataScope,
  id: string,
): { raw: string; metadata: Record<string, unknown> | null } {
  const entry = registry.get(key(scope, id));
  const raw = (entry && typeof (entry.room as any).metadata === 'string')
    ? (entry.room as any).metadata as string
    : '';
  let metadata: Record<string, unknown> | null = null;
  if (raw) {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') metadata = obj as Record<string, unknown>;
    } catch {
      /* ignore */
    }
  }
  return { raw, metadata };
}

export interface SetRoomMetadataOptions {
  /** LiveKit room name (e.g. `live_<id>`, `party_<id>`, `call_<id>`). */
  roomName: string;
  /** Object will be JSON-stringified. Pass null to clear. */
  metadata: Record<string, unknown> | null;
}

/**
 * Server-side update via `livekit-room-metadata` edge function.
 * Host owns scope (live_streams.host_id / party_rooms.host_id / private_calls
 * caller_id or host_id). Admin can call any room via x-admin-access-token.
 * Throws on error.
 */
export async function setRoomMetadata(
  scope: RoomMetadataScope,
  scopeId: string,
  opts: SetRoomMetadataOptions,
): Promise<{ ok: true }> {
  const body = {
    action: 'set',
    scope,
    scopeId,
    roomName: opts.roomName,
    metadata: opts.metadata,
  };
  const { data, error } = await supabase.functions.invoke('livekit-room-metadata', { body });
  if (error) throw new Error(error.message ?? 'room_metadata_set_failed');
  if ((data as any)?.error) throw new Error((data as any).error);
  return { ok: true };
}

/** React hook — subscribes to room metadata updates for a scope/id. */
export function useRoomMetadata(
  scope: RoomMetadataScope,
  id: string | null | undefined,
): { raw: string; metadata: Record<string, unknown> | null } {
  const [state, setState] = useState<{ raw: string; metadata: Record<string, unknown> | null }>(
    () => (id ? readRoomMetadata(scope, id) : { raw: '', metadata: null }),
  );
  useEffect(() => {
    if (!id) return;
    setState(readRoomMetadata(scope, id));
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<RoomMetadataEventDetail>).detail;
      if (!detail || detail.scope !== scope || detail.id !== id) return;
      setState({ raw: detail.raw, metadata: detail.metadata });
    };
    window.addEventListener('livekit-room-metadata', handler);
    return () => window.removeEventListener('livekit-room-metadata', handler);
  }, [scope, id]);
  return state;
}

/** Test-only registry inspector. */
export function _isRoomMetadataRegistered(scope: RoomMetadataScope, id: string): boolean {
  return registry.has(key(scope, id));
}
