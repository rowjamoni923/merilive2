// Pkg111: livekitEgress unit tests.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

const isEnabledMock = vi.fn();
vi.mock('@/lib/livekitSignaling', () => ({
  isLiveKitEnabled: (...args: unknown[]) => isEnabledMock(...args),
}));

import {
  startStreamRecording,
  stopStreamRecording,
  listMyRecordings,
} from '@/lib/livekitEgress';

describe('Pkg111 livekitEgress', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    fromMock.mockReset();
    isEnabledMock.mockReset();
  });

  it('startStreamRecording returns null when kill-switch off', async () => {
    isEnabledMock.mockResolvedValue(false);
    const r = await startStreamRecording('stream-1');
    expect(r).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('startStreamRecording returns null when streamId empty', async () => {
    isEnabledMock.mockResolvedValue(true);
    const r = await startStreamRecording('');
    expect(r).toBeNull();
  });

  it('startStreamRecording returns mapped result on success', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({
      data: { egressId: 'EG_123', recordingId: 'rec-1', fileUrl: 'https://cdn/x.mp4' },
      error: null,
    });
    const r = await startStreamRecording('stream-1', { layout: 'grid', audioOnly: true });
    expect(r).toEqual({
      egressId: 'EG_123',
      recordingId: 'rec-1',
      fileUrl: 'https://cdn/x.mp4',
      alreadyRecording: false,
    });
    expect(invokeMock).toHaveBeenCalledWith('livekit-egress', {
      body: { action: 'start', streamId: 'stream-1', layout: 'grid', audioOnly: true },
    });
  });

  it('startStreamRecording returns null on invoke error', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const r = await startStreamRecording('stream-1');
    expect(r).toBeNull();
  });

  it('startStreamRecording surfaces alreadyRecording', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({
    });
    const r = await startStreamRecording('stream-1');
    expect(r?.alreadyRecording).toBe(true);
    expect(r?.egressId).toBe('EG_dup');
  });

  it('stopStreamRecording returns false when egressId empty', async () => {
    const ok = await stopStreamRecording('');
    expect(ok).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('stopStreamRecording true on success', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    const ok = await stopStreamRecording('EG_123');
    expect(ok).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('livekit-egress', {
    });
  });

  it('stopStreamRecording false on error', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'nope' } });
    const ok = await stopStreamRecording('EG_123');
    expect(ok).toBe(false);
  });

  it('listMyRecordings returns rows from stream_recordings table', async () => {
    const rows = [{ id: 'r1', egress_id: 'EG_1' }];
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const select = vi.fn().mockReturnValue({ order });
    fromMock.mockReturnValue({ select });
    const r = await listMyRecordings(5);
    expect(r).toEqual(rows);
    expect(fromMock).toHaveBeenCalledWith('stream_recordings');
    expect(limit).toHaveBeenCalledWith(5);
  });
});
