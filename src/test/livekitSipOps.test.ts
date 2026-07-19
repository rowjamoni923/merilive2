import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@/integrations/supabase/adminClient', () => ({
  adminSupabase: { functions: { invoke: (...a: unknown[]) => invokeMock(...a) } },
}));

import {
  listLiveKitInboundTrunks,
  listLiveKitOutboundTrunks,
  listLiveKitDispatchRules,
  deleteLiveKitInboundTrunk,
  deleteLiveKitOutboundTrunk,
  deleteLiveKitDispatchRule,
} from '@/lib/livekitSipOps';

describe('Pkg138 livekitSipOps', () => {
  beforeEach(() => invokeMock.mockReset());

  it('listLiveKitInboundTrunks unwraps trunks[]', async () => {
    invokeMock.mockResolvedValue({
      data: { trunks: [{ sipTrunkId: 'ST_IN_1', name: 'Twilio' }] },
      error: null,
    });
    const out = await listLiveKitInboundTrunks();
    expect(out).toHaveLength(1);
    expect(invokeMock).toHaveBeenCalledWith('livekit-sip-ops', {
      body: { action: 'list_inbound_trunks' },
    });
  });

  it('listLiveKitOutboundTrunks returns [] when missing', async () => {
    invokeMock.mockResolvedValue({ data: {}, error: null });
    expect(await listLiveKitOutboundTrunks()).toEqual([]);
  });

  it('listLiveKitDispatchRules unwraps rules[]', async () => {
    invokeMock.mockResolvedValue({
    });
    const out = await listLiveKitDispatchRules();
    expect(out[0].sipDispatchRuleId).toBe('SDR_1');
  });

  it('deleteLiveKitInboundTrunk requires id', async () => {
    await expect(deleteLiveKitInboundTrunk('')).rejects.toThrow(/sip_trunk_id_required/);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('deleteLiveKitInboundTrunk forwards id', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await deleteLiveKitInboundTrunk('ST_IN_3')).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('livekit-sip-ops', {
    });
  });

  it('deleteLiveKitOutboundTrunk forwards id', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await deleteLiveKitOutboundTrunk('ST_OUT_5')).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('livekit-sip-ops', {
    });
  });

  it('deleteLiveKitDispatchRule requires id', async () => {
    await expect(deleteLiveKitDispatchRule('')).rejects.toThrow(
      /sip_dispatch_rule_id_required/,
    );
  });

  it('deleteLiveKitDispatchRule forwards id', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await deleteLiveKitDispatchRule('SDR_9')).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('livekit-sip-ops', {
    });
  });

  it('propagates edge fn error field', async () => {
    invokeMock.mockResolvedValue({ data: { error: 'sip_ops_disabled' }, error: null });
    await expect(listLiveKitInboundTrunks()).rejects.toThrow(/sip_ops_disabled/);
  });

  it('propagates transport error', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('network_fail') });
    await expect(listLiveKitInboundTrunks()).rejects.toThrow(/network_fail/);
  });
});
