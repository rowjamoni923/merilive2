import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@/integrations/supabase/adminClient', () => ({
  adminSupabase: { functions: { invoke: (...a: unknown[]) => invokeMock(...a) } },
}));

import {
  listLiveKitEgress,
  getLiveKitEgress,
  updateLiveKitEgressLayout,
} from '@/lib/livekitEgressOps';

describe('Pkg136 livekitEgressOps', () => {
  beforeEach(() => invokeMock.mockReset());

  it('listLiveKitEgress unwraps egress[]', async () => {
    invokeMock.mockResolvedValue({
      data: { egress: [{ egressId: 'EG_1', roomName: 'live_1', status: 'EGRESS_ACTIVE' }] },
      error: null,
    });
    const out = await listLiveKitEgress();
    expect(out).toHaveLength(1);
    expect(out[0].egressId).toBe('EG_1');
    expect(invokeMock).toHaveBeenCalledWith('livekit-egress-ops', {
      body: { action: 'list_egress' },
    });
  });

  it('listLiveKitEgress forwards roomName + active', async () => {
    invokeMock.mockResolvedValue({ data: { egress: [] }, error: null });
    await listLiveKitEgress({ roomName: 'live_42', active: true });
    expect(invokeMock).toHaveBeenCalledWith('livekit-egress-ops', {
    });
  });

  it('listLiveKitEgress returns [] when missing', async () => {
    invokeMock.mockResolvedValue({ data: {}, error: null });
    expect(await listLiveKitEgress()).toEqual([]);
  });

  it('getLiveKitEgress requires id', async () => {
    await expect(getLiveKitEgress('')).rejects.toThrow(/egress_id_required/);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('getLiveKitEgress forwards id', async () => {
    invokeMock.mockResolvedValue({
    });
    const out = await getLiveKitEgress('EG_7');
    expect(out?.egressId).toBe('EG_7');
    expect(invokeMock).toHaveBeenCalledWith('livekit-egress-ops', {
    });
  });

  it('updateLiveKitEgressLayout requires id+layout', async () => {
    await expect(updateLiveKitEgressLayout('', 'grid' as any)).rejects.toThrow(/egress_id_required/);
    await expect(updateLiveKitEgressLayout('EG_1', '' as any)).rejects.toThrow(/layout_required/);
  });

  it('updateLiveKitEgressLayout forwards args', async () => {
    invokeMock.mockResolvedValue({
    });
    const out = await updateLiveKitEgressLayout('EG_3', 'grid-dark');
    expect(out?.egressId).toBe('EG_3');
    expect(invokeMock).toHaveBeenCalledWith('livekit-egress-ops', {
    });
  });

  it('propagates edge fn error field', async () => {
    invokeMock.mockResolvedValue({ data: { error: 'egress_ops_disabled' }, error: null });
    await expect(listLiveKitEgress()).rejects.toThrow(/egress_ops_disabled/);
  });

  it('propagates transport error', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('network_fail') });
    await expect(listLiveKitEgress()).rejects.toThrow(/network_fail/);
  });
});
