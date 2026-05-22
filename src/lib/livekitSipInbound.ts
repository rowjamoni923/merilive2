// Pkg115: LiveKit SIP Inbound client helpers — admin-only.
// Allows admins to map PSTN phone numbers (via a LiveKit-managed SIP trunk)
// to a target live room. Incoming calls become regular room participants
// with identity `${participant_identity_prefix}<callId>`.
//
// Kill-switch: app_settings.livekit_signaling_enabled.sip_inbound === true
// Auth: x-admin-access-token (admin session token). Calling from user app fails.
import { supabase } from '@/integrations/supabase/client';

export type SipInboundRuleType = 'direct' | 'individual';

export interface SipInboundRoute {
  id: string;
  name: string;
  trunk_id: string | null;
  dispatch_rule_id: string | null;
  phone_numbers: string[];
  room_name: string | null;
  room_prefix: string | null;
  rule_type: SipInboundRuleType;
  participant_identity_prefix: string;
  enabled: boolean;
  created_at: string;
}

function adminHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined'
    ? window.localStorage.getItem('admin_access_token') ?? ''
    : '';
  return token ? { 'x-admin-access-token': token } : {};
}

async function call<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T | null> {
  const { data, error } = await supabase.functions.invoke('livekit-sip-inbound', {
    body: { action, ...payload },
    headers: adminHeaders(),
  });
  if (error) {
    console.warn(`[Pkg115] ${action} error`, error);
    return null;
  }
  return (data ?? null) as T | null;
}

export async function createInboundTrunk(name: string, numbers: string[]): Promise<string | null> {
  if (!name || !Array.isArray(numbers) || numbers.length === 0) return null;
  const res = await call<{ trunkId: string | null }>('create_trunk', { name, numbers });
  return res?.trunkId ?? null;
}

export async function createInboundRoute(input: {
  name: string;
  trunkId?: string;
  numbers?: string[];
  roomName?: string;
  roomPrefix?: string;
  ruleType?: SipInboundRuleType;
  participantIdentityPrefix?: string;
}): Promise<{ routeId: string; dispatchRuleId: string | null } | null> {
  if (!input.name) return null;
  const res = await call<{ routeId: string; dispatchRuleId: string | null }>('create_route', input);
  return res ?? null;
}

export async function listInboundRoutes(): Promise<SipInboundRoute[]> {
  const res = await call<{ routes: SipInboundRoute[] }>('list_routes');
  return res?.routes ?? [];
}

export async function deleteInboundRoute(routeId: string): Promise<boolean> {
  if (!routeId) return false;
  const res = await call<{ ok: boolean }>('delete_route', { routeId });
  return !!res?.ok;
}

export async function setInboundRouteEnabled(routeId: string, enabled: boolean): Promise<boolean> {
  if (!routeId) return false;
  const res = await call<{ ok: boolean }>('set_enabled', { routeId, enabled });
  return !!res?.ok;
}

/**
 * Identify a LiveKit participant that came in over SIP.
 * Dispatch rule prefixes the participant identity, default `sip_`.
 */
export function isSipInboundIdentity(identity: string | null | undefined, prefix = 'sip_'): boolean {
  if (!identity) return false;
  return identity.startsWith(prefix);
}
