/**
 * Pkg139 — Admin LiveKit Agent Dispatch Ops client
 *
 * Read + cancel inspection of LiveKit Agent dispatches across every room.
 * Companion to Pkg117 (host-only `livekit-agent`). Admin variant operates on
 * ANY room.
 *
 * Admin-only via `adminSupabase` (auto-sends `x-admin-access-token`).
 * Requires kill-switch `app_settings.livekit_signaling_enabled.agent_ops === true`.
 *
 * Zero new Supabase channels, zero polls, zero cross-user reads.
 */
import { adminSupabase } from '@/integrations/supabase/adminClient';

export interface LiveKitAgentDispatchSummary {
  id: string | null;
  agentName: string | null;
  room: string | null;
  metadata: string | null;
  state: unknown;
  createdAt: number | string | null;
}

async function invoke<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await adminSupabase.functions.invoke('livekit-agent-ops', {
    body: { action, ...body },
  });
  if (error) throw error;
  if (data && typeof data === 'object' && 'error' in (data as any)) {
    throw new Error(String((data as any).error));
  }
  return data as T;
}

export async function listLiveKitAgentDispatches(
  roomName?: string,
): Promise<LiveKitAgentDispatchSummary[]> {
  const { dispatches } = await invoke<{ dispatches: LiveKitAgentDispatchSummary[] }>(
    'list_dispatches',
    roomName ? { roomName } : {},
  );
  return dispatches ?? [];
}

export async function getLiveKitAgentDispatch(
  dispatchId: string,
  roomName: string,
): Promise<LiveKitAgentDispatchSummary | null> {
  if (!dispatchId) throw new Error('dispatch_id_required');
  if (!roomName) throw new Error('room_name_required');
  const { dispatch } = await invoke<{ dispatch: LiveKitAgentDispatchSummary | null }>(
    'get_dispatch',
    { dispatchId, roomName },
  );
  return dispatch ?? null;
}

export async function deleteLiveKitAgentDispatch(
  dispatchId: string,
  roomName: string,
): Promise<boolean> {
  if (!dispatchId) throw new Error('dispatch_id_required');
  if (!roomName) throw new Error('room_name_required');
  const { ok } = await invoke<{ ok: boolean }>('delete_dispatch', {
    dispatchId,
    roomName,
  });
  return ok === true;
}
