/**
 * Pkg116: LiveKit Realtime Transcription / Captions
 *
 * Subscribes to LiveKit `RoomEvent.TranscriptionReceived` on existing call/live/party
 * Rooms and dispatches `window 'livekit-transcription'` CustomEvents so any UI
 * (caption bar, moderation panel) can render without opening new Supabase channels.
 *
 * Zero new Supabase Realtime channels. Zero polls. Zero cross-user profile reads.
 *
 * Optional persistence: caller may invoke `persistTranscriptionSegment()` to
 * write *final* segments into `transcription_segments` (admin/host-readable per RLS).
 * Live captions themselves never round-trip through Supabase.
 *
 * Speech-to-Text source: a LiveKit Agent (Deepgram/OpenAI/etc.) joins the room
 * server-side and publishes transcriptions. This client lib only consumes them.
 */
import type { Room, RoomEvent as RoomEventType, TranscriptionSegment } from 'livekit-client';
import { supabase } from '@/integrations/supabase/client';

export type TranscriptionScope = 'call' | 'live' | 'party';

export interface TranscriptionEvent {
  scope: TranscriptionScope;
  id: string;
  roomName: string;
  identity: string | undefined;
  segments: Array<{
    text: string;
    language?: string;
    final: boolean;
    startTime?: number;
    endTime?: number;
  }>;
}

type Key = `${TranscriptionScope}:${string}`;

interface Entry {
  room: Room;
  off: () => void;
}

const registry = new Map<Key, Entry>();

function keyOf(scope: TranscriptionScope, id: string): Key {
  return `${scope}:${id}`;
}

/**
 * Normalize LiveKit's TranscriptionSegment to our wire shape.
 * LiveKit's `final` flag varies across SDK versions — treat undefined as true.
 */
function normalize(seg: TranscriptionSegment) {
  return {
    id: (seg as any).id ?? '',
    text: seg.text ?? '',
    language: (seg as any).language,
    final: (seg as any).final !== false,
    startTime: (seg as any).startTime,
    endTime: (seg as any).endTime,
  };
}

export function registerRoomForTranscription(
  scope: TranscriptionScope,
  id: string,
  room: Room,
): () => void {
  const key = keyOf(scope, id);
  const existing = registry.get(key);
  if (existing) {
    if (existing.room === room) return existing.off;
    existing.off();
  }

  // Lazy-import RoomEvent enum to keep this lib tree-shake friendly in tests.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const lk = require('livekit-client') as { RoomEvent: typeof RoomEventType };
  const evt = lk.RoomEvent.TranscriptionReceived;

  const handler = (
    segments: TranscriptionSegment[],
    participant?: { identity?: string },
  ) => {
    if (!segments?.length) return;
    if (typeof window === 'undefined') return;
    const detail: TranscriptionEvent = {
      scope,
      id,
      roomName: room.name,
      identity: participant?.identity,
    };
    window.dispatchEvent(new CustomEvent('livekit-transcription', { detail }));
  };

  (room as any).on(evt, handler);
  const off = () => {
    try {
      (room as any).off(evt, handler);
    } catch {
      /* room may already be disconnected */
    }
    registry.delete(key);
  };

  registry.set(key, { room, off });
  return off;
}

export function unregisterRoomForTranscription(scope: TranscriptionScope, id: string): void {
  const entry = registry.get(keyOf(scope, id));
  entry?.off();
}

export function isRoomRegisteredForTranscription(
  scope: TranscriptionScope,
  id: string,
): boolean {
  return registry.has(keyOf(scope, id));
}

/** Test-only: drop every registration without touching the underlying Rooms. */
export function __resetTranscriptionRegistryForTests(): void {
  for (const entry of registry.values()) {
    try {
      entry.off();
    } catch {
      /* noop */
    }
  }
  registry.clear();
}

/**
 * Optional: persist a single FINAL segment for moderation/history.
 * Caller decides when (e.g. only host-side, only when admin enables it).
 * No-op for non-final segments.
 */
export async function persistTranscriptionSegment(input: {
  scope: TranscriptionScope;
  scopeId: string;
  roomName: string;
  participantIdentity?: string;
  segmentId?: string;
  text: string;
  language?: string;
  isFinal: boolean;
  startTime?: number;
  endTime?: number;
}): Promise<{ ok: boolean; error?: string }> {
  if (!input.isFinal) return { ok: false, error: 'non_final_segment' };
  if (!input.text?.trim()) return { ok: false, error: 'empty_text' };
  try {
    const { error } = await supabase.from('transcription_segments').insert({
      scope_id: input.scopeId,
      room_name: input.roomName,
      participant_identity: input.participantIdentity ?? null,
      segment_id: input.segmentId ?? null,
      is_final: true,
      start_time: input.startTime ?? null,
      end_time: input.endTime ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
