/**
 * Pkg127: Host-facing LiveKit moderation client.
 *
 * Hosts can mute / unmute / kick participants in their own live or party room.
 * Calls the same `livekit-moderate` edge function as Pkg99 admin, but auths
 * with the Supabase user JWT instead of an admin token. The edge function
 * verifies the caller owns the room (live_streams.host_id / party_rooms.host_id
 * with matching room_name) before executing.
 *
 * No Supabase Realtime channels, no polls. Pure REST.
 *
 * Kill-switch: `app_settings.livekit_signaling_enabled.moderation` (default ON).
 */
import { supabase } from '@/integrations/supabase/client';
import { isLiveKitEnabled } from './livekitSignaling';

export type HostModerationAction =
  | 'mute_all_audio'
  | 'unmute_all_audio'
  | 'mute_participant_audio'
  | 'unmute_participant_audio'
  | 'kick_participant';

interface BaseRequest {
  roomName: string;
  reason?: string;
}

interface IdentityRequest extends BaseRequest {
  identity: string;
}

export interface ModerationResult {
  success: boolean;
  error?: string;
  result?: unknown;
}

async function invoke(action: HostModerationAction, body: Record<string, any>): Promise<ModerationResult> {
  if (!(await isLiveKitEnabled('moderation'))) {
    return { success: false, error: 'moderation_disabled' };
  }
  try {
    const { data, error } = await supabase.functions.invoke('livekit-moderate', {
      body: { action, ...body },
    });
    if (error) return { success: false, error: error.message ?? String(error) };
    const ok = (data as any)?.success === true;
    return ok
      ? { success: true, result: (data as any)?.result }
      : { success: false, error: (data as any)?.error ?? 'unknown_error' };
  } catch (e) {
    return { success: false, error: (e as Error)?.message ?? String(e) };
  }
}

/** Mute every audience-side mic in the room. Host's own mic is auto-excluded. */
export function hostMuteAllAudio(req: BaseRequest) {
  return invoke('mute_all_audio', req);
}

/** Unmute every previously-muted audience mic. Host auto-excluded. */
export function hostUnmuteAllAudio(req: BaseRequest) {
  return invoke('unmute_all_audio', req);
}

/** Mute one participant's microphone (all their audio tracks). */
export function hostMuteParticipantAudio(req: IdentityRequest) {
  return invoke('mute_participant_audio', req);
}

/** Unmute one participant's microphone (all their audio tracks). */
export function hostUnmuteParticipantAudio(req: IdentityRequest) {
  return invoke('unmute_participant_audio', req);
}

/** Remove a participant from the room (server disconnect). */
export function hostKickParticipant(req: IdentityRequest) {
  return invoke('kick_participant', req);
}
