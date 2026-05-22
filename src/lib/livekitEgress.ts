// Pkg111: LiveKit Egress client helpers — record host's live stream to S3.
//
// Kill-switch: app_settings.livekit_signaling_enabled.egress === true
// Requires server-side S3 env vars (see supabase/functions/livekit-egress).
// Pure REST — zero Supabase Realtime channels, zero polling.
import { supabase } from '@/integrations/supabase/client';
import { isLiveKitEnabled } from './livekitSignaling';
import {
  type EgressLayout,
  getEgressLayoutChoice,
  isEgressLayout,
} from './livekitEgressLayouts';

export interface EgressStartResult {
  egressId: string;
  recordingId: string | null;
  fileUrl: string | null;
  alreadyRecording?: boolean;
}

export async function startStreamRecording(
  streamId: string,
  opts?: { layout?: EgressLayout; audioOnly?: boolean },
): Promise<EgressStartResult | null> {
  if (!streamId) return null;
  if (!(await isLiveKitEnabled('egress'))) return null;

  // Pkg151: fall back to the user's persisted layout choice if caller didn't
  // pass one explicitly. Server re-validates against the same whitelist.
  const layout: EgressLayout =
    opts?.layout && isEgressLayout(opts.layout) ? opts.layout : getEgressLayoutChoice();

  const { data, error } = await supabase.functions.invoke('livekit-egress', {
    body: { action: 'start', streamId, layout, audioOnly: opts?.audioOnly },
  });
  if (error) {
    console.warn('[Pkg111] startStreamRecording error', error);
    return null;
  }
  if (!data?.egressId) return null;
  return {
    egressId: data.egressId,
    recordingId: data.recordingId ?? null,
    fileUrl: data.fileUrl ?? null,
    alreadyRecording: !!data.alreadyRecording,
  };
}

export async function stopStreamRecording(egressId: string): Promise<boolean> {
  if (!egressId) return false;
  try {
    const { error } = await supabase.functions.invoke('livekit-egress', {
      body: { action: 'stop', egressId },
    });
    if (error) {
      console.warn('[Pkg111] stopStreamRecording error', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[Pkg111] stopStreamRecording threw', e);
    return false;
  }
}

/** List recent recordings for the current authenticated host. */
export async function listMyRecordings(limit = 20) {
  const { data, error } = await supabase
    .from('stream_recordings')
    .select('id, stream_id, room_name, egress_id, file_url, duration_seconds, size_bytes, status, started_at, ended_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[Pkg111] listMyRecordings error', error);
    return [];
  }
  return data ?? [];
}
