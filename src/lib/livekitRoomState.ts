/**
 * Pkg143: Standard typed room-state schemas on Pkg122 Room Metadata
 *
 * Closes Pkg122's "concrete UI panels deferred" gap by providing canonical
 * shared-state shapes that every call/live/party feature should reuse instead
 * of inventing its own key names.
 *
 * Wire-format on `room.metadata` (single JSON blob persisted by LiveKit SFU):
 *   {
 *     v: 1,
 *     currentSong?:    { id, title, artist?, artworkUrl?, startedAt? },
 *     pinnedMessage?:  { id, text, authorIdentity?, pinnedAt? },
 *     theme?:          { id, name?, primary? },
 *     poll?:           { id, question, options:[{id,label}], expiresAt?, allowMulti? },
 *     locked?:         boolean,
 *     topic?:          string,
 *     announcement?:   { text, severity:'info'|'warn', expiresAt? },
 *     custom?:         Record<string, unknown>  // open escape hatch
 *   }
 *
 * Each typed setter does a merge-safe update: it reads the current metadata,
 * overlays only the slice you pass, and writes it back via Pkg122
 * `setRoomMetadata`. Passing `null` for a slice clears it.
 *
 * Hooks (`useCurrentSong`, `usePinnedMessage`, …) return the slice live as the
 * SFU re-broadcasts metadata to every participant — late joiners get the
 * current state for free.
 *
 * Rules:
 *   - Money/audit persistence is NOT in scope here — this is transient
 *     shared UI state. Persistent things (chat history, gift ledger) stay
 *     in Supabase RPC.
 *   - Rides Pkg122 `room_metadata` kill-switch (default OFF; admin opts in).
 *   - Zero new Supabase channels, polls, cross-user reads, edge fns, migrations.
 */
import { useEffect, useState } from 'react';
import {
  readRoomMetadata,
  setRoomMetadata,
  useRoomMetadata,
  type RoomMetadataScope,
} from './livekitRoomMetadata';

export const ROOM_STATE_VERSION = 1 as const;

export interface CurrentSong {
  id: string;
  title: string;
  artist?: string;
  artworkUrl?: string;
  /** Unix ms when playback started on the host's side. */
  startedAt?: number;
}

export interface PinnedMessage {
  id: string;
  text: string;
  authorIdentity?: string;
  /** Unix ms. */
  pinnedAt?: number;
}

export interface RoomTheme {
  id: string;
  name?: string;
  /** Hex or HSL string; pure transport — UI maps to tokens. */
  primary?: string;
}

export interface RoomPollOption {
  id: string;
  label: string;
}

export interface RoomPoll {
  id: string;
  question: string;
  options: RoomPollOption[];
  /** Unix ms; absent → poll never expires. */
  expiresAt?: number;
  allowMulti?: boolean;
}

export interface RoomAnnouncement {
  text: string;
  severity: 'info' | 'warn';
  /** Unix ms; absent → permanent until cleared. */
  expiresAt?: number;
}

export interface RoomState {
  v: typeof ROOM_STATE_VERSION;
  currentSong?: CurrentSong | null;
  pinnedMessage?: PinnedMessage | null;
  theme?: RoomTheme | null;
  poll?: RoomPoll | null;
  locked?: boolean;
  topic?: string;
  announcement?: RoomAnnouncement | null;
  custom?: Record<string, unknown>;
}

const EMPTY: RoomState = { v: ROOM_STATE_VERSION };

function parse(raw: Record<string, unknown> | null): RoomState {
  if (!raw || typeof raw !== 'object') return EMPTY;
  return { ...EMPTY, ...raw, v: ROOM_STATE_VERSION };
}

/** Sync snapshot of current room state (from cached Pkg122 metadata). */
export function readRoomState(scope: RoomMetadataScope, id: string): RoomState {
  const { metadata } = readRoomMetadata(scope, id);
  return parse(metadata);
}

/** React hook returning the full typed room state. */
export function useRoomState(
  scope: RoomMetadataScope,
  id: string | null | undefined,
): RoomState {
  const { metadata } = useRoomMetadata(scope, id);
  const [state, setState] = useState<RoomState>(() => parse(metadata));
  useEffect(() => {
    setState(parse(metadata));
  }, [metadata]);
  return state;
}

// ─── Slice hooks ──────────────────────────────────────────────────────────
// All thin wrappers over useRoomState — kept tiny to avoid re-renders for
// callers that only care about one slice.

export function useCurrentSong(scope: RoomMetadataScope, id: string | null | undefined) {
  return useRoomState(scope, id).currentSong ?? null;
}
export function usePinnedMessage(scope: RoomMetadataScope, id: string | null | undefined) {
  return useRoomState(scope, id).pinnedMessage ?? null;
}
export function useRoomTheme(scope: RoomMetadataScope, id: string | null | undefined) {
  return useRoomState(scope, id).theme ?? null;
}
export function useRoomPoll(scope: RoomMetadataScope, id: string | null | undefined) {
  return useRoomState(scope, id).poll ?? null;
}
export function useRoomLocked(scope: RoomMetadataScope, id: string | null | undefined): boolean {
  return useRoomState(scope, id).locked === true;
}
export function useRoomTopic(scope: RoomMetadataScope, id: string | null | undefined) {
  return useRoomState(scope, id).topic ?? '';
}
export function useRoomAnnouncement(scope: RoomMetadataScope, id: string | null | undefined) {
  return useRoomState(scope, id).announcement ?? null;
}

// ─── Typed setters (merge-safe) ───────────────────────────────────────────

export interface RoomScopeRef {
  scope: RoomMetadataScope;
  scopeId: string;
  /** LiveKit room name (e.g. `live_<id>`, `party_<id>`, `call_<id>`). */
  roomName: string;
}

async function merge(
  ref: RoomScopeRef,
  patch: Partial<RoomState>,
): Promise<{ ok: true; next: RoomState }> {
  const current = readRoomState(ref.scope, ref.scopeId);
  const next: RoomState = { ...current, ...patch, v: ROOM_STATE_VERSION };
  // Drop explicit nulls / undefineds so the SFU blob stays small.
  for (const k of Object.keys(next) as (keyof RoomState)[]) {
    const v = next[k];
    if (v === null || v === undefined) {
      if (k !== 'v') delete (next as any)[k];
    }
  }
  await setRoomMetadata(ref.scope, ref.scopeId, {
    roomName: ref.roomName,
    metadata: next as unknown as Record<string, unknown>,
  });
  return { ok: true, next };
}

export const setCurrentSong = (ref: RoomScopeRef, song: CurrentSong | null) =>
  merge(ref, { currentSong: song });

export const setPinnedMessage = (ref: RoomScopeRef, msg: PinnedMessage | null) =>
  merge(ref, { pinnedMessage: msg });

export const setRoomThemeState = (ref: RoomScopeRef, theme: RoomTheme | null) =>
  merge(ref, { theme });

export const setRoomPoll = (ref: RoomScopeRef, poll: RoomPoll | null) =>
  merge(ref, { poll });

export const setRoomLocked = (ref: RoomScopeRef, locked: boolean) => merge(ref, { locked });

export const setRoomTopic = (ref: RoomScopeRef, topic: string) => merge(ref, { topic });

export const setRoomAnnouncement = (ref: RoomScopeRef, announcement: RoomAnnouncement | null) =>
  merge(ref, { announcement });

export const setRoomCustom = (ref: RoomScopeRef, custom: Record<string, unknown> | null) =>
  merge(ref, { custom: custom ?? undefined });

/** Clear ALL room state at once. */
export const clearRoomState = async (ref: RoomScopeRef) => {
  await setRoomMetadata(ref.scope, ref.scopeId, {
    roomName: ref.roomName,
    metadata: { v: ROOM_STATE_VERSION },
  });
  return { ok: true };
};
