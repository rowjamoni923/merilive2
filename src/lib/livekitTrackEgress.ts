// Pkg113: Track Egress client helpers (admin-only, per-participant recording).
//
// Difference from Pkg111: records ONE participant's single audio or video track
// (for moderation evidence), not the composited room.
//
// Server validates admin via x-admin-access-token. Kill-switch:
// app_settings.livekit_signaling_enabled.track_egress === true
import { supabase } from '@/integrations/supabase/client';

export interface TrackEgressStartResult {
  egressId: string;
  recordingId: string | null;
  fileUrl: string | null;
}

function adminToken(): string | null {
  try {
    return (
      localStorage.getItem('admin_access_token') ||
      sessionStorage.getItem('admin_access_token') ||
      null
    );
  } catch {
    return null;
  }
}

export async function startTrackEgress(opts: {
  roomName: string;
  identity: string;
  trackSid: string;
  kind?: 'audio' | 'video';
  streamId?: string;
  reason?: string;
}): Promise<TrackEgressStartResult | null> {
  const token = adminToken();
  if (!token) return null;

  const { data, error } = await supabase.functions.invoke('livekit-track-egress', {
    body: { action: 'start', ...opts },
    headers: { 'x-admin-access-token': token },
  });
  if (error) {
    console.warn('[Pkg113] startTrackEgress error', error);
    return null;
  }
  if (!data?.egressId) return null;
  return {
    egressId: data.egressId,
    recordingId: data.recordingId ?? null,
    fileUrl: data.fileUrl ?? null,
  };
}

export async function stopTrackEgress(egressId: string): Promise<boolean> {
  if (!egressId) return false;
  const token = adminToken();
  if (!token) return false;
  try {
    const { error } = await supabase.functions.invoke('livekit-track-egress', {
      body: { action: 'stop', egressId },
      headers: { 'x-admin-access-token': token },
    });
    if (error) {
      console.warn('[Pkg113] stopTrackEgress error', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[Pkg113] stopTrackEgress threw', e);
    return false;
  }
}

/** Admin list — RLS restricts to admin sessions; non-admin gets []. */
export async function listTrackRecordings(opts?: { roomName?: string; limit?: number }) {
  let q = supabase
    .from('track_recordings')
    .select('id, room_name, participant_identity, track_sid, track_kind, egress_id, file_url, duration_seconds, size_bytes, status, started_at, ended_at, reason')
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 50);
  if (opts?.roomName) q = q.eq('room_name', opts.roomName);
  const { data, error } = await q;
  if (error) {
    console.warn('[Pkg113] listTrackRecordings error', error);
    return [];
  }
  return data ?? [];
}
