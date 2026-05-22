import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async (_name: string, opts: any) => {
        const action = opts?.body?.action;
        if (action === 'dispatch') {
          return { data: { ok: true, id: 'row1', dispatchId: 'disp_xyz' }, error: null };
        }
        if (action === 'cancel') return { data: { ok: true }, error: null };
        if (action === 'list') {
          return { data: { ok: true, dispatches: [{ id: 'd1' }] }, error: null };
        }
        return { data: null, error: { message: 'unknown' } };
      }),
    },
  },
}));

import {
  dispatchAgent,
  cancelAgentDispatch,
  listAgentDispatches,
  isAgentIdentity,
  AGENT_IDENTITY_PREFIX,
} from '@/lib/livekitAgent';

describe('Pkg117 livekitAgent client', () => {
  it('dispatchAgent returns dispatchId', async () => {
    const res = await dispatchAgent({
      scope: 'live',
      scopeId: 's1',
      roomName: 'live_s1',
      agentName: 'voice-ai-host',
      metadata: { lang: 'en' },
    });
    expect(res.ok).toBe(true);
    expect(res.dispatchId).toBe('disp_xyz');
  });

  it('cancelAgentDispatch invokes edge fn', async () => {
    const res = await cancelAgentDispatch({ dispatchId: 'disp_xyz', roomName: 'live_s1' });
    expect(res.ok).toBe(true);
  });

  it('listAgentDispatches returns array', async () => {
    const res = await listAgentDispatches('live_s1');
    expect(res.ok).toBe(true);
    expect(res.dispatches).toHaveLength(1);
  });

  it('isAgentIdentity detects prefix', () => {
    expect(AGENT_IDENTITY_PREFIX).toBe('agent_');
    expect(isAgentIdentity('agent_voice-ai-host_123')).toBe(true);
    expect(isAgentIdentity('user_42')).toBe(false);
    expect(isAgentIdentity(undefined)).toBe(false);
    expect(isAgentIdentity('')).toBe(false);
    expect(isAgentIdentity('bot_x', 'bot_')).toBe(true);
  });
});
