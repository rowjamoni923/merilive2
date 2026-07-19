// Pkg128: forward-participant client unit tests.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

const isEnabledMock = vi.fn();
vi.mock('@/lib/livekitSignaling', () => ({
  isLiveKitEnabled: (...args: unknown[]) => isEnabledMock(...args),
}));

import { forwardParticipant } from '@/lib/livekitForwardParticipant';

describe('Pkg128 forwardParticipant', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    isEnabledMock.mockReset();
  });

  it('rejects when required fields missing', async () => {
    isEnabledMock.mockResolvedValue(true);
    const r = await forwardParticipant({ srcRoom: '', dstRoom: 'b', identity: 'u1' });
    expect(r).toEqual({ success: false, error: 'missing_required_fields' });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('rejects when src equals dst', async () => {
    isEnabledMock.mockResolvedValue(true);
    const r = await forwardParticipant({ srcRoom: 'a', dstRoom: 'a', identity: 'u1' });
    expect(r).toEqual({ success: false, error: 'src_and_dst_must_differ' });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('returns forward_participant_disabled when kill-switch off', async () => {
    isEnabledMock.mockResolvedValue(false);
    const r = await forwardParticipant({ srcRoom: 'a', dstRoom: 'b', identity: 'u1' });
    expect(r).toEqual({ success: false, error: 'forward_participant_disabled' });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('happy path forwards body and returns result', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({
      data: { success: true, result: { forwarded: 'u1' } },
      error: null,
    });
    const r = await forwardParticipant({
      srcRoom: 'live_a',
      dstRoom: 'live_b',
      identity: 'u1',
      reason: 'queue->host',
    });
    expect(r).toEqual({ success: true, result: { forwarded: 'u1' } });
    expect(invokeMock).toHaveBeenCalledWith('livekit-forward-participant', {
      body: {
        srcRoom: 'live_a',
        dstRoom: 'live_b',
        identity: 'u1',
        reason: 'queue->host',
      },
    });
  });

  it('omits reason when not provided', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({ data: { success: true }, error: null });
    await forwardParticipant({ srcRoom: 'a', dstRoom: 'b', identity: 'u1' });
    expect(invokeMock).toHaveBeenCalledWith('livekit-forward-participant', {
      body: { srcRoom: 'a', dstRoom: 'b', identity: 'u1' },
    });
  });

  it('surfaces edge function error', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const r = await forwardParticipant({ srcRoom: 'a', dstRoom: 'b', identity: 'u1' });
    expect(r).toEqual({ success: false, error: 'boom' });
  });

  it('surfaces server-side success:false', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({
      data: { success: false, error: 'not_src_room_host' },
      error: null,
    });
    const r = await forwardParticipant({ srcRoom: 'a', dstRoom: 'b', identity: 'u1' });
    expect(r).toEqual({ success: false, error: 'not_src_room_host' });
  });
});
