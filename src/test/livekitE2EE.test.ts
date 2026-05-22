/**
 * Pkg108: LiveKit E2EE foundation tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock('@/lib/livekitSignaling', () => ({
  isLiveKitEnabled: vi.fn(),
}));

import { supabase } from '@/integrations/supabase/client';
import { isLiveKitEnabled } from '@/lib/livekitSignaling';
import { fetchCallE2EEKey, buildE2EEOptions } from '@/lib/livekitE2EE';

describe('Pkg108 livekitE2EE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchCallE2EEKey returns decoded bytes from RPC', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: btoa('A'.repeat(32)), error: null });
    const out = await fetchCallE2EEKey('call-1');
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out!.length).toBe(32);
  });

  it('fetchCallE2EEKey returns null on RPC error', async () => {
    (supabase.rpc as any).mockResolvedValue({ data: null, error: { message: 'forbidden' } });
    expect(await fetchCallE2EEKey('call-1')).toBeNull();
  });

  it('fetchCallE2EEKey returns null for empty id', async () => {
    expect(await fetchCallE2EEKey('')).toBeNull();
  });

  it('buildE2EEOptions returns undefined when key is null', async () => {
    const { e2eeOption } = await buildE2EEOptions(null);
    expect(e2eeOption).toBeUndefined();
  });

  it('buildE2EEOptions returns undefined when kill-switch off', async () => {
    (isLiveKitEnabled as any).mockResolvedValue(false);
    const { e2eeOption } = await buildE2EEOptions(new Uint8Array(32));
    expect(e2eeOption).toBeUndefined();
  });

  it('buildE2EEOptions returns undefined when Insertable Streams unsupported', async () => {
    (isLiveKitEnabled as any).mockResolvedValue(true);
    // jsdom has no RTCRtpSender / RTCRtpScriptTransform → expect undefined.
    const { e2eeOption } = await buildE2EEOptions(new Uint8Array(32));
    expect(e2eeOption).toBeUndefined();
  });
});
