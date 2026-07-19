import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@/integrations/supabase/adminClient', () => ({
  adminSupabase: { functions: { invoke: (...a: unknown[]) => invokeMock(...a) } },
}));

import {
  listLiveKitIngress,
  getLiveKitIngress,
  deleteLiveKitIngress,
} from '@/lib/livekitIngressOps';

describe('Pkg137 livekitIngressOps', () => {
  beforeEach(() => invokeMock.mockReset());

  it('listLiveKitIngress unwraps ingress[]', async () => {
    invokeMock.mockResolvedValue({
      data: { ingress: [{ ingressId: 'IN_1', roomName: 'live_1', inputType: 'RTMP_INPUT' }] },
      error: null,
    });
    const out = await listLiveKitIngress();
    expect(out).toHaveLength(1);
    expect(out[0].ingressId).toBe('IN_1');
    expect(invokeMock).toHaveBeenCalledWith('livekit-ingress-ops', {
      body: { action: 'list_ingress' },
    });
  });

  it('listLiveKitIngress forwards roomName', async () => {
    invokeMock.mockResolvedValue({ data: { ingress: [] }, error: null });
    await listLiveKitIngress({ roomName: 'live_42' });
    expect(invokeMock).toHaveBeenCalledWith('livekit-ingress-ops', {
    });
  });

  it('listLiveKitIngress returns [] when missing', async () => {
    invokeMock.mockResolvedValue({ data: {}, error: null });
    expect(await listLiveKitIngress()).toEqual([]);
  });

  it('getLiveKitIngress requires id', async () => {
    await expect(getLiveKitIngress('')).rejects.toThrow(/ingress_id_required/);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('getLiveKitIngress forwards id', async () => {
    invokeMock.mockResolvedValue({
    });
    const out = await getLiveKitIngress('IN_7');
    expect(out?.ingressId).toBe('IN_7');
    expect(invokeMock).toHaveBeenCalledWith('livekit-ingress-ops', {
    });
  });

  it('deleteLiveKitIngress requires id', async () => {
    await expect(deleteLiveKitIngress('')).rejects.toThrow(/ingress_id_required/);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('deleteLiveKitIngress forwards id', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    const ok = await deleteLiveKitIngress('IN_3');
    expect(ok).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('livekit-ingress-ops', {
    });
  });

  it('propagates edge fn error field', async () => {
    invokeMock.mockResolvedValue({ data: { error: 'ingress_ops_disabled' }, error: null });
    await expect(listLiveKitIngress()).rejects.toThrow(/ingress_ops_disabled/);
  });

  it('propagates transport error', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('network_fail') });
    await expect(listLiveKitIngress()).rejects.toThrow(/network_fail/);
  });
});
