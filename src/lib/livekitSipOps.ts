/**
 * Pkg138 — Admin LiveKit SIP Ops client
 *
 * Read + delete inspection of SIP trunks (inbound/outbound) and dispatch rules.
 * Create stays in `livekit-sip-inbound` (Pkg115) and Pkg110 outbound flow.
 * Phone numbers + auth credentials returned MASKED.
 *
 * Admin-only via `adminSupabase` (auto-sends `x-admin-access-token`).
 * Requires kill-switch `app_settings.livekit_signaling_enabled.sip_ops === true`.
 *
 * Zero new Supabase channels, zero polls, zero cross-user reads.
 */
import { adminSupabase } from '@/integrations/supabase/adminClient';

export interface LiveKitInboundTrunkSummary {
  sipTrunkId: string | null;
  name: string | null;
  metadata: string | null;
  numbers: (string | null)[];
  allowedAddresses: string[];
  allowedNumbers: (string | null)[];
  authUsername: string | null;
  authPassword: string | null;
}

export interface LiveKitOutboundTrunkSummary {
  sipTrunkId: string | null;
  name: string | null;
  metadata: string | null;
  address: string | null;
  transport: string | null;
  numbers: (string | null)[];
  authUsername: string | null;
  authPassword: string | null;
}

export interface LiveKitDispatchRuleSummary {
  sipDispatchRuleId: string | null;
  name: string | null;
  metadata: string | null;
  trunkIds: string[];
  hidePhoneNumber: boolean | null;
  rule: unknown;
}

async function invoke<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await adminSupabase.functions.invoke('livekit-sip-ops', {
    body: { action, ...body },
  });
  if (error) throw error;
  if (data && typeof data === 'object' && 'error' in (data as any)) {
    throw new Error(String((data as any).error));
  }
  return data as T;
}

export async function listLiveKitInboundTrunks(): Promise<LiveKitInboundTrunkSummary[]> {
  const { trunks } = await invoke<{ trunks: LiveKitInboundTrunkSummary[] }>(
    'list_inbound_trunks',
  );
  return trunks ?? [];
}

export async function listLiveKitOutboundTrunks(): Promise<LiveKitOutboundTrunkSummary[]> {
  const { trunks } = await invoke<{ trunks: LiveKitOutboundTrunkSummary[] }>(
    'list_outbound_trunks',
  );
  return trunks ?? [];
}

export async function listLiveKitDispatchRules(): Promise<LiveKitDispatchRuleSummary[]> {
  const { rules } = await invoke<{ rules: LiveKitDispatchRuleSummary[] }>(
    'list_dispatch_rules',
  );
  return rules ?? [];
}

export async function deleteLiveKitInboundTrunk(sipTrunkId: string): Promise<boolean> {
  if (!sipTrunkId) throw new Error('sip_trunk_id_required');
  const { ok } = await invoke<{ ok: boolean }>('delete_inbound_trunk', { sipTrunkId });
  return ok === true;
}

export async function deleteLiveKitOutboundTrunk(sipTrunkId: string): Promise<boolean> {
  if (!sipTrunkId) throw new Error('sip_trunk_id_required');
  const { ok } = await invoke<{ ok: boolean }>('delete_outbound_trunk', { sipTrunkId });
  return ok === true;
}

export async function deleteLiveKitDispatchRule(sipDispatchRuleId: string): Promise<boolean> {
  if (!sipDispatchRuleId) throw new Error('sip_dispatch_rule_id_required');
  const { ok } = await invoke<{ ok: boolean }>('delete_dispatch_rule', {
    sipDispatchRuleId,
  });
  return ok === true;
}
