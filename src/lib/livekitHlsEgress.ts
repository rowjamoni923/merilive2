// Pkg126: LiveKit HLS Egress — record a live stream as a browser-playable
// `.m3u8` HLS playlist (+ `.ts` segments) instead of (or in addition to)
// the Pkg111 MP4 file. Lets viewers replay in any <video> tag / hls.js
// without downloading a multi-GB MP4.
//
// Kill-switch: app_settings.livekit_signaling_enabled.hls_egress === true
// Same S3 bucket / creds as Pkg111 (LIVEKIT_EGRESS_S3_*).
// Pure REST — zero Supabase Realtime channels, zero polling.
import { supabase } from '@/integrations/supabase/client';
import { isLiveKitEnabled } from './livekitSignaling';
import {
  type EgressLayout,
  getEgressLayoutChoice,
  isEgressLayout,
} from './livekitEgressLayouts';

export interface HlsEgressStartResult {
  egressId: string;
  recordingId: string | null;
  playlistUrl: string | null;
  alreadyRecording?: boolean;
}

export async function startStreamHlsRecording(
  streamId: string,
  opts?: {
    layout?: EgressLayout;
    audioOnly?: boolean;
    /** seconds per .ts segment (2-10, default 4) */
    segmentDuration?: number;
  },
): Promise<HlsEgressStartResult | null> {
  if (!streamId) return null;
  if (!(await isLiveKitEnabled('hls_egress'))) return null;

  // Pkg151: shared persisted layout choice (same key as MP4 path).
  const layout: EgressLayout =
    opts?.layout && isEgressLayout(opts.layout) ? opts.layout : getEgressLayoutChoice();

  const { data, error } = await supabase.functions.invoke('livekit-hls-egress', {
    body: {
      action: 'start',
      streamId,
      layout,
      audioOnly: opts?.audioOnly,
      segmentDuration: opts?.segmentDuration,
    },
  });
  if (error) {
    console.warn('[Pkg126] startStreamHlsRecording error', error);
    return null;
  }
  if (!data?.egressId) return null;
  return {
    egressId: data.egressId,
    recordingId: data.recordingId ?? null,
    playlistUrl: data.playlistUrl ?? null,
    alreadyRecording: !!data.alreadyRecording,
  };
}

export async function stopStreamHlsRecording(egressId: string): Promise<boolean> {
  if (!egressId) return false;
  try {
    const { error } = await supabase.functions.invoke('livekit-hls-egress', {
      body: { action: 'stop', egressId },
    });
    if (error) {
      console.warn('[Pkg126] stopStreamHlsRecording error', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[Pkg126] stopStreamHlsRecording threw', e);
    return false;
  }
}

/** List recent HLS-format recordings for the current host. */
export async function listMyHlsRecordings(limit = 20) {
  const { data, error } = await supabase
    .from('stream_recordings')
    .select(
      'id, stream_id, room_name, egress_id, playlist_url, format, duration_seconds, size_bytes, status, started_at, ended_at',
    )
    .eq('format', 'hls')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[Pkg126] listMyHlsRecordings error', error);
    return [];
  }
  return data ?? [];
}
