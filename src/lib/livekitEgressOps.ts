/**
 * Pkg136 — Admin LiveKit Egress Ops client
 *
 * Read-only inspection of LiveKit egress jobs + safe layout swap for
 * room-composite recordings. Stop/cancel stays in feature-specific edge fns
 * (livekit-egress / livekit-hls-egress / livekit-stream-egress).
 *
 * Admin-only via `adminSupabase` (auto-sends `x-admin-access-token`).
 * Requires kill-switch `app_settings.livekit_signaling_enabled.egress_ops === true`.
 *
 * Zero new Supabase channels, zero polls, zero cross-user reads.
 */
import { adminSupabase } from '@/integrations/supabase/adminClient';

export interface LiveKitEgressSummary {
  egressId: string | null;
  roomName: string | null;
  status: string | null;
  startedAt: number | null;
  updatedAt: number | null;
  endedAt: number | null;
  error: string | null;
  fileResults: Array<{ location: string | null; size: number | null; duration: number | null }>;
  streamResults: Array<{ url: string | null; status: string | null }>;
  segmentResults: Array<{
    playlistName: string | null;
    playlistLocation: string | null;
    segmentCount: number | null;
  }>;
}

async function invoke<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await adminSupabase.functions.invoke('livekit-egress-ops', {
    body: { action, ...body },
  });
  if (error) throw error;
  if (data && typeof data === 'object' && 'error' in (data as any)) {
    throw new Error(String((data as any).error));
  }
  return data as T;
}

export async function listLiveKitEgress(
  opts: { roomName?: string; active?: boolean } = {},
): Promise<LiveKitEgressSummary[]> {
  const { egress } = await invoke<{ egress: LiveKitEgressSummary[] }>('list_egress', {
    ...(opts.roomName ? { roomName: opts.roomName } : {}),
    ...(opts.active ? { active: true } : {}),
  });
  return egress ?? [];
}

export async function getLiveKitEgress(
  egressId: string,
): Promise<LiveKitEgressSummary | null> {
  if (!egressId) throw new Error('egress_id_required');
  const { egress } = await invoke<{ egress: LiveKitEgressSummary | null }>('get_egress', {
    egressId,
  });
  return egress ?? null;
}

export type LiveKitEgressLayout =
  | 'speaker'
  | 'speaker-dark'
  | 'speaker-light'
  | 'grid'
  | 'grid-dark'
  | 'grid-light'
  | 'single-speaker'
  | 'single-speaker-dark'
  | 'single-speaker-light';

export async function updateLiveKitEgressLayout(
  egressId: string,
  layout: LiveKitEgressLayout,
): Promise<LiveKitEgressSummary | null> {
  if (!egressId) throw new Error('egress_id_required');
  if (!layout) throw new Error('layout_required');
  const { egress } = await invoke<{ egress: LiveKitEgressSummary | null }>('update_layout', {
    egressId,
    layout,
  });
  return egress ?? null;
}
