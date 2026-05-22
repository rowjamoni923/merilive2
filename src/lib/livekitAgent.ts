/**
 * Pkg117: LiveKit Agents (Voice AI dispatch) — client helpers
 *
 * Thin wrapper around `livekit-agent` edge function. Hosts/admin dispatch a
 * registered agent worker (Python/Node, running outside this app and
 * registered with LiveKit Cloud) into a specific room. The agent then joins
 * as a regular participant — UIs can detect it via `agent_*` identity prefix.
 */
import { supabase } from '@/integrations/supabase/client';

export type AgentScope = 'call' | 'live' | 'party';
export const AGENT_IDENTITY_PREFIX = 'agent_';

export interface DispatchAgentInput {
  scope: AgentScope;
  scopeId?: string;
  roomName: string;
  agentName: string;
  metadata?: Record<string, unknown>;
}

export interface DispatchAgentResult {
  ok: boolean;
  id?: string;
  dispatchId?: string | null;
  error?: string;
  detail?: string;
}

export async function dispatchAgent(input: DispatchAgentInput): Promise<DispatchAgentResult> {
  const { data, error } = await supabase.functions.invoke('livekit-agent', {
    body: { action: 'dispatch', ...input },
  });
  if (error) return { ok: false, error: error.message };
  return data as DispatchAgentResult;
}

export async function cancelAgentDispatch(params: {
  dispatchId: string;
  roomName: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('livekit-agent', {
    body: { action: 'cancel', ...params },
  });
  if (error) return { ok: false, error: error.message };
  return data as { ok: boolean; error?: string };
}

export async function listAgentDispatches(roomName: string) {
  const { data, error } = await supabase.functions.invoke('livekit-agent', {
    body: { action: 'list', roomName },
  });
  if (error) return { ok: false as const, error: error.message, dispatches: [] };
  return data as { ok: boolean; dispatches: any[]; error?: string };
}

/** Identify an agent participant by identity prefix. */
export function isAgentIdentity(identity: string | undefined | null, prefix = AGENT_IDENTITY_PREFIX): boolean {
  if (!identity) return false;
  return identity.startsWith(prefix);
}
