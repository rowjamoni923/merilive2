// Pkg126: livekitHlsEgress unit tests.
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
  startStreamHlsRecording,
  stopStreamHlsRecording,
  listMyHlsRecordings,
} from '@/lib/livekitHlsEgress';

describe('Pkg126 livekitHlsEgress', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    fromMock.mockReset();
    isEnabledMock.mockReset();
  });

  it('start returns null when kill-switch off', async () => {
    isEnabledMock.mockResolvedValue(false);
    expect(await startStreamHlsRecording('s1')).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('start returns null when streamId empty', async () => {
    isEnabledMock.mockResolvedValue(true);
    expect(await startStreamHlsRecording('')).toBeNull();
  });

  it('start forwards layout/audioOnly/segmentDuration', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({
      data: { egressId: 'EG_H1', recordingId: 'rec-h1', playlistUrl: 'https://cdn/x.m3u8' },
      error: null,
    });
    const r = await startStreamHlsRecording('s1', { layout: 'grid', audioOnly: false, segmentDuration: 6 });
    expect(r).toEqual({
      egressId: 'EG_H1',
      recordingId: 'rec-h1',
      playlistUrl: 'https://cdn/x.m3u8',
      alreadyRecording: false,
    });
    expect(invokeMock).toHaveBeenCalledWith('livekit-hls-egress', {
      body: { action: 'start', streamId: 's1', layout: 'grid', audioOnly: false, segmentDuration: 6 },
    });
  });

  it('start returns null on invoke error', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    expect(await startStreamHlsRecording('s1')).toBeNull();
  });

  it('start surfaces alreadyRecording', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({
      data: { egressId: 'EG_dup', alreadyRecording: true },
      error: null,
    });
    const r = await startStreamHlsRecording('s1');
    expect(r?.alreadyRecording).toBe(true);
    expect(r?.egressId).toBe('EG_dup');
  });

  it('stop false when egressId empty', async () => {
    expect(await stopStreamHlsRecording('')).toBe(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('stop true on success', async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await stopStreamHlsRecording('EG_H1')).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('livekit-hls-egress', {
      body: { action: 'stop', egressId: 'EG_H1' },
    });
  });

  it('stop false on error', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'nope' } });
    expect(await stopStreamHlsRecording('EG_H1')).toBe(false);
  });

  it('listMyHlsRecordings filters by format=hls', async () => {
    const rows = [{ id: 'h1', format: 'hls', playlist_url: 'x.m3u8' }];
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi.fn().mockReturnValue({ limit });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ select });
    const r = await listMyHlsRecordings(5);
    expect(r).toEqual(rows);
    expect(fromMock).toHaveBeenCalledWith('stream_recordings');
    expect(eq).toHaveBeenCalledWith('format', 'hls');
    expect(limit).toHaveBeenCalledWith(5);
  });
});
