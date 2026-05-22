// Pkg109: LiveKit RTMP/WHIP Ingress client helpers.
// Hosts can broadcast into their existing live_streams room from OBS / external
// RTMP sources. Pure REST — no new Supabase Realtime channel, no polling.
//
// Kill-switch: app_settings.livekit_signaling_enabled.ingress === true
// Host-only: edge function verifies stream ownership via JWT.
import { supabase } from '@/integrations/supabase/client';
import { isLiveKitEnabled } from './livekitSignaling';

export type IngressInputType = 'rtmp' | 'whip';

export interface IngressCredentials {
  ingressId: string;
  /** RTMP(S) or WHIP URL to point OBS / encoder at. */
  url: string;
  /** Stream key — secret, host-only. Never expose to viewers. */
  streamKey: string;
  inputType: IngressInputType;
  reused?: boolean;
}

/**
 * Create (or reuse) an RTMP/WHIP ingress for the host's live stream.
 * Returns null when the ingress kill-switch is off or stream/host mismatch.
 */
export async function createLiveStreamIngress(
  streamId: string,
  inputType: IngressInputType = 'rtmp',
): Promise<IngressCredentials | null> {
  if (!streamId) return null;
  if (!(await isLiveKitEnabled('ingress'))) return null;

  const { data, error } = await supabase.functions.invoke('livekit-ingress', {
    body: { streamId, action: 'create', inputType },
  });
  if (error) {
    console.warn('[Pkg109] createLiveStreamIngress error', error);
    return null;
  }
  if (!data || !data.ingressId || !data.url || !data.streamKey) return null;
  return {
    ingressId: data.ingressId,
    url: data.url,
    streamKey: data.streamKey,
    inputType: (data.inputType as IngressInputType) ?? inputType,
    reused: !!data.reused,
  };
}

/** Tear down the ingress when the host ends/leaves the stream. Best-effort. */
export async function deleteLiveStreamIngress(streamId: string): Promise<boolean> {
  if (!streamId) return false;
  try {
    const { error } = await supabase.functions.invoke('livekit-ingress', {
      body: { streamId, action: 'delete' },
    });
    if (error) {
      console.warn('[Pkg109] deleteLiveStreamIngress error', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[Pkg109] deleteLiveStreamIngress threw', e);
    return false;
  }
}

/**
 * Fetch existing ingress credentials for the host's own stream (RPC enforces
 * host-only via RLS-style check). Useful for showing OBS settings on reload.
 */
export async function fetchLiveStreamIngress(
  streamId: string,
): Promise<Omit<IngressCredentials, 'reused'> | null> {
  if (!streamId) return null;
  const { data, error } = await supabase
    .rpc('get_live_stream_ingress', { _stream_id: streamId } as never);
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ingress_id || !row?.rtmp_url || !row?.stream_key) return null;
  return {
    ingressId: row.ingress_id as string,
    url: row.rtmp_url as string,
    streamKey: row.stream_key as string,
    inputType: ((row.ingress_type as string) || 'rtmp') as IngressInputType,
  };
}
