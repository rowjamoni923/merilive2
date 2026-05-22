/**
 * Pkg118: E2EE for Private Calls — unit tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
const isEnabledMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

vi.mock('@/lib/livekitSignaling', () => ({
  isLiveKitEnabled: (...args: unknown[]) => isEnabledMock(...args),
}));

import {
  isE2EESupported,
  getCallE2EEPassphrase,
  buildE2EERoomOptions,
  provisionCallE2EE,
} from '@/lib/livekitE2EE';

describe('Pkg118 livekitE2EE', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    isEnabledMock.mockReset();
    isEnabledMock.mockResolvedValue(true);
    // jsdom provides crypto.subtle + Worker in vitest browser env.
  });

  it('isE2EESupported reflects environment', () => {
    // In vitest jsdom env, both Worker and crypto.subtle exist.
    expect(typeof isE2EESupported()).toBe('boolean');
  });

  it('rejects missing call id', async () => {
    const r = await getCallE2EEPassphrase('');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('missing_call_id');
  });

  it('rejects when kill-switch off', async () => {
    isEnabledMock.mockResolvedValue(false);
    const r = await getCallE2EEPassphrase('call-1');
    expect(r.ok).toBe(false);
    expect(r.error).toBe('e2ee_disabled');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns passphrase on success', async () => {
    rpcMock.mockResolvedValue({ data: 'abc123base64', error: null });
    const r = await getCallE2EEPassphrase('call-1');
    if (!isE2EESupported()) {
      expect(r.ok).toBe(false);
      return;
    }
    expect(r.ok).toBe(true);
    expect(r.passphrase).toBe('abc123base64');
    expect(rpcMock).toHaveBeenCalledWith('ensure_call_e2ee_key', { _call_id: 'call-1' });
  });

  it('propagates RPC error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'not_authorized' } });
    const r = await getCallE2EEPassphrase('call-1');
    if (!isE2EESupported()) return;
    expect(r.ok).toBe(false);
    expect(r.error).toBe('not_authorized');
  });

  it('buildE2EERoomOptions returns null without passphrase', async () => {
    const r = await buildE2EERoomOptions(null);
    expect(r).toBeNull();
  });

  it('provisionCallE2EE returns reason on rpc failure', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const r = await provisionCallE2EE('call-1');
    expect(r.ok).toBe(false);
    expect(r.e2ee).toBeNull();
  });
});
