/**
 * Pkg135 — Admin LiveKit Room Ops client
 *
 * Read-only inspection of live LiveKit SFU state (admin-only).
 * Wraps the `livekit-room-ops` edge fn. Mutations live in `livekitModeration`.
 *
 * Requires:
 *   • adminClient (sends `x-admin-access-token` header automatically — Pkg5)
 *   • kill-switch `app_settings.livekit_signaling_enabled.room_ops === true`
 *
 * Zero new Supabase channels, zero polls, zero cross-user profile reads.
 */
import { adminSupabase } from '@/integrations/supabase/adminClient';

export interface LiveKitRoomSummary {
  sid: string;
  name: string;
  numParticipants: number;
  numPublishers: number;
  creationTime: number | null;
  emptyTimeout: number | null;
  maxParticipants: number | null;
  metadata: string;
  activeRecording: boolean;
}

export interface LiveKitParticipantTrack {
  sid: string;
  type: number; // 0=audio, 1=video
  source: number; // 1=camera, 2=microphone, 3=screen_share, 4=screen_share_audio
  name: string;
  muted: boolean;
  mimeType: string;
}

export interface LiveKitParticipantSummary {
  sid: string;
  identity: string;
  name: string;
  state: number | string;
  joinedAt: number | null;
  metadata: string;
  permission: unknown;
  isPublisher: boolean;
  numTracks: number;
  tracks?: LiveKitParticipantTrack[];
}


async function invoke<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await adminSupabase.functions.invoke('livekit-room-ops', {
    body: { action, ...body },
  });
  if (error) throw error;
  if (data && typeof data === 'object' && 'error' in (data as any)) {
    throw new Error(String((data as any).error));
  }
  return data as T;
}

export async function listLiveKitRooms(): Promise<LiveKitRoomSummary[]> {
  const { rooms } = await invoke<{ rooms: LiveKitRoomSummary[] }>('list_rooms');
  return rooms ?? [];
}

export async function listLiveKitRoomParticipants(
  roomName: string,
): Promise<LiveKitParticipantSummary[]> {
  if (!roomName) throw new Error('room_name_required');
  const { participants } = await invoke<{ participants: LiveKitParticipantSummary[] }>(
    'list_participants',
    { roomName },
  );
  return participants ?? [];
}

export async function getLiveKitRoom(roomName: string): Promise<{
  room: LiveKitRoomSummary | null;
  participants: Array<{
    sid: string;
    identity: string;
    state: number | string;
    joinedAt: number | null;
    isPublisher: boolean;
  }>;
}> {
  if (!roomName) throw new Error('room_name_required');
  return invoke('get_room', { roomName });
}
