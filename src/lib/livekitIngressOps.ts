/**
 * Pkg137 — Admin LiveKit Ingress Ops client
 *
 * Read-only inspection + safe delete of LiveKit ingress jobs
 * (Pkg109 RTMP/WHIP). Create/update stays in `livekit-ingress`.
 *
 * Admin-only via `adminSupabase` (auto-sends `x-admin-access-token`).
 * Requires kill-switch `app_settings.livekit_signaling_enabled.ingress_ops === true`.
 *
 * Zero new Supabase channels, zero polls, zero cross-user reads.
 */
import { adminSupabase } from '@/integrations/supabase/adminClient';

export interface LiveKitIngressSummary {
  ingressId: string | null;
  name: string | null;
  /** Stream key returned masked (`•••XXXX`) — never expose full key. */
  streamKey: string | null;
  url: string | null;
  inputType: string | null;
  roomName: string | null;
  participantIdentity: string | null;
  participantName: string | null;
  reusable: boolean | null;
  state: {
    status: string | null;
    error: string | null;
    startedAt: number | null;
    endedAt: number | null;
    resourceId: string | null;
  } | null;
}

async function invoke<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await adminSupabase.functions.invoke('livekit-ingress-ops', {
    body: { action, ...body },
  });
  if (error) throw error;
  if (data && typeof data === 'object' && 'error' in (data as any)) {
    throw new Error(String((data as any).error));
  }
  return data as T;
}

export async function listLiveKitIngress(
  opts: { roomName?: string } = {},
): Promise<LiveKitIngressSummary[]> {
  const { ingress } = await invoke<{ ingress: LiveKitIngressSummary[] }>('list_ingress', {
    ...(opts.roomName ? { roomName: opts.roomName } : {}),
  });
  return ingress ?? [];
}

export async function getLiveKitIngress(
  ingressId: string,
): Promise<LiveKitIngressSummary | null> {
  if (!ingressId) throw new Error('ingress_id_required');
  const { ingress } = await invoke<{ ingress: LiveKitIngressSummary | null }>('get_ingress', {
    ingressId,
  });
  return ingress ?? null;
}

export async function deleteLiveKitIngress(ingressId: string): Promise<boolean> {
  if (!ingressId) throw new Error('ingress_id_required');
  const { ok } = await invoke<{ ok: boolean }>('delete_ingress', { ingressId });
  return ok === true;
}
