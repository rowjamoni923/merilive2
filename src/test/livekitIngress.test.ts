/**
 * Pkg109: LiveKit RTMP/WHIP Ingress client tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    rpc: vi.fn(),
  },
}));

vi.mock('@/lib/livekitSignaling', () => ({
  isLiveKitEnabled: vi.fn(),
}));

import { supabase } from '@/integrations/supabase/client';
import { isLiveKitEnabled } from '@/lib/livekitSignaling';
import {
  createLiveStreamIngress,
  deleteLiveStreamIngress,
  fetchLiveStreamIngress,
} from '@/lib/livekitIngress';

describe('Pkg109 livekitIngress', () => {
  beforeEach(() => vi.clearAllMocks());

  it('createLiveStreamIngress returns null when kill-switch is off', async () => {
    (isLiveKitEnabled as any).mockResolvedValue(false);
    expect(await createLiveStreamIngress('stream-1')).toBeNull();
    expect((supabase.functions.invoke as any)).not.toHaveBeenCalled();
  });

  it('createLiveStreamIngress returns null for empty stream id', async () => {
    expect(await createLiveStreamIngress('')).toBeNull();
  });

  it('createLiveStreamIngress maps edge function response to credentials', async () => {
    (isLiveKitEnabled as any).mockResolvedValue(true);
    (supabase.functions.invoke as any).mockResolvedValue({
      data: { ingressId: 'IN_1', url: 'rtmps://x', streamKey: 'sk_abc', inputType: 'rtmp' },
      error: null,
    });
    const out = await createLiveStreamIngress('stream-1');
    expect(out).toEqual({
      ingressId: 'IN_1', url: 'rtmps://x', streamKey: 'sk_abc',
      inputType: 'rtmp', reused: false,
    });
  });

  it('createLiveStreamIngress returns null on edge function error', async () => {
    (isLiveKitEnabled as any).mockResolvedValue(true);
    (supabase.functions.invoke as any).mockResolvedValue({
      data: null, error: { message: 'ingress_disabled' },
    });
    expect(await createLiveStreamIngress('stream-1')).toBeNull();
  });

  it('createLiveStreamIngress returns null on malformed response', async () => {
    (isLiveKitEnabled as any).mockResolvedValue(true);
    (supabase.functions.invoke as any).mockResolvedValue({ data: {}, error: null });
    expect(await createLiveStreamIngress('stream-1')).toBeNull();
  });

  it('deleteLiveStreamIngress invokes edge function with action=delete', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({ data: { ok: true }, error: null });
    expect(await deleteLiveStreamIngress('stream-1')).toBe(true);
    expect((supabase.functions.invoke as any)).toHaveBeenCalledWith('livekit-ingress', {
      body: { streamId: 'stream-1', action: 'delete' },
    });
  });

  it('fetchLiveStreamIngress returns null when no row', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: [], error: null });
    expect(await fetchLiveStreamIngress('stream-1')).toBeNull();
  });

  it('fetchLiveStreamIngress maps RPC row', async () => {
    (supabase.rpc as any).mockResolvedValue({
      data: [{ ingress_id: 'IN_1', rtmp_url: 'rtmps://x', stream_key: 'sk', ingress_type: 'whip' }],
      error: null,
    });
    expect(await fetchLiveStreamIngress('stream-1')).toEqual({
      ingressId: 'IN_1', url: 'rtmps://x', streamKey: 'sk', inputType: 'whip',
    });
  });
});
