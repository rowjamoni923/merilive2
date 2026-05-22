// Pkg114: LiveKit Stream Egress client helpers — simulcast host's live stream
// to YouTube / Facebook / Twitch / custom RTMP endpoints.
//
// Kill-switch: app_settings.livekit_signaling_enabled.stream_egress === true
// Requires server-side LIVEKIT_API_KEY/SECRET + LIVEKIT_URL (no S3 needed).
// Pure REST — zero Supabase Realtime channels, zero polling.
import { supabase } from '@/integrations/supabase/client';
import { isLiveKitEnabled } from './livekitSignaling';

export interface SimulcastStartResult {
  egressId: string;
  simulcastId: string | null;
  providers: string[];
  rtmpUrlsMasked: string[];
}

/** Quick client-side guard so we don't even hit the function with bad input. */
export function isLikelyRtmpUrl(url: string): boolean {
  if (typeof url !== 'string' || url.length === 0 || url.length > 500) return false;
  return /^rtmps?:\/\/[^\s]+\/[^\s]+\/[^\s]+/i.test(url);
}

export async function startStreamSimulcast(
  streamId: string,
  urls: string[],
  opts?: { layout?: 'speaker' | 'grid' | 'single-speaker'; audioOnly?: boolean },
): Promise<SimulcastStartResult | null> {
  if (!streamId || !Array.isArray(urls) || urls.length === 0) return null;
  if (!(await isLiveKitEnabled('stream_egress'))) return null;

  const { data, error } = await supabase.functions.invoke('livekit-stream-egress', {
    body: { action: 'start', streamId, urls, layout: opts?.layout, audioOnly: opts?.audioOnly },
  });
  if (error) {
    console.warn('[Pkg114] startStreamSimulcast error', error);
    return null;
  }
  if (!data?.egressId) return null;
  return {
    egressId: data.egressId,
    simulcastId: data.simulcastId ?? null,
    providers: Array.isArray(data.providers) ? data.providers : [],
    rtmpUrlsMasked: Array.isArray(data.rtmpUrlsMasked) ? data.rtmpUrlsMasked : [],
  };
}

export async function stopStreamSimulcast(egressId: string): Promise<boolean> {
  if (!egressId) return false;
  try {
    const { error } = await supabase.functions.invoke('livekit-stream-egress', {
      body: { action: 'stop', egressId },
    });
    if (error) {
      console.warn('[Pkg114] stopStreamSimulcast error', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[Pkg114] stopStreamSimulcast threw', e);
    return false;
  }
}

/** List recent simulcasts for the current authenticated host. */
export async function listMySimulcasts(limit = 20) {
  const { data, error } = await supabase
    .from('stream_simulcasts')
    .select('id, stream_id, room_name, egress_id, providers, rtmp_urls_masked, status, started_at, ended_at, duration_seconds, error')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[Pkg114] listMySimulcasts error', error);
    return [];
  }
  return data ?? [];
}
