// Pkg99 — Admin client helper for LiveKit server-side moderation
// Calls the `livekit-moderate` edge function with the admin link token.
import { supabase } from '@/integrations/supabase/client';
import { getAdminLinkToken } from '@/utils/adminAccessStorage';

export type LiveKitModerationAction =
  | 'mute_track'
  | 'unmute_track'
  | 'remove_participant'
  | 'disconnect_room'
  | 'update_participant';

export interface LiveKitModerationRequest {
  action: LiveKitModerationAction;
  roomName: string;
  identity?: string;
  trackSid?: string;
  reason?: string;
  metadata?: string;
  permission?: Record<string, unknown>;
}

export interface LiveKitModerationResult {
  success: boolean;
  error?: string;
  result?: unknown;
}

export async function moderateLiveKit(
  req: LiveKitModerationRequest,
): Promise<LiveKitModerationResult> {
  const adminToken = getAdminLinkToken();
  if (!adminToken) {
    return { success: false, error: 'missing_admin_token' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('livekit-moderate', {
      body: req,
      headers: { 'x-admin-access-token': adminToken },
    });
    if (error) {
      return { success: false, error: error.message ?? String(error) };
    }
    const ok = (data as any)?.success === true;
    return ok
      ? { success: true, result: (data as any)?.result }
      : { success: false, error: (data as any)?.error ?? 'unknown_error' };
  } catch (e: any) {
    return { success: false, error: e?.message ?? String(e) };
  }
}

// Convenience helpers
export const adminLiveKitDisconnectRoom = (roomName: string, reason?: string) =>
  moderateLiveKit({ action: 'disconnect_room', roomName, reason });

export const adminLiveKitRemoveParticipant = (
  roomName: string,
  identity: string,
  reason?: string,
) =>
  moderateLiveKit({ action: 'remove_participant', roomName, identity, reason });

export const adminLiveKitMuteTrack = (
  roomName: string,
  identity: string,
  trackSid: string,
  reason?: string,
) =>
  moderateLiveKit({ action: 'mute_track', roomName, identity, trackSid, reason });

export const adminLiveKitUnmuteTrack = (
  roomName: string,
  identity: string,
  trackSid: string,
) => moderateLiveKit({ action: 'unmute_track', roomName, identity, trackSid });
