// Pkg113: Track Egress client tests (no network — invoke is mocked).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => invokeMock(...args) },
    from: (...args: any[]) => fromMock(...args),
  },
}));

import {
  startTrackEgress,
  stopTrackEgress,
  listTrackRecordings,
} from '@/lib/livekitTrackEgress';

beforeEach(() => {
  invokeMock.mockReset();
  fromMock.mockReset();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch { /* jsdom only */ }
});

describe('Pkg113 startTrackEgress', () => {
  it('returns null without admin token', async () => {
    const r = await startTrackEgress({ roomName: 'live_x', identity: 'u', trackSid: 'TR_1' });
    expect(r).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('invokes edge fn with admin token header and start action', async () => {
    localStorage.setItem('admin_access_token', 'tok-abc');
    invokeMock.mockResolvedValueOnce({
      data: { egressId: 'EG_1', recordingId: 'rec-1', fileUrl: 'https://cdn/x.mp4' },
      error: null,
    });
    const r = await startTrackEgress({
      roomName: 'live_x', identity: 'u', trackSid: 'TR_1', kind: 'video',
    });
    expect(invokeMock).toHaveBeenCalledWith(
      'livekit-track-egress',
      expect.objectContaining({
        body: expect.objectContaining({ action: 'start', roomName: 'live_x', trackSid: 'TR_1' }),
        headers: { 'x-admin-access-token': 'tok-abc' },
      }),
    );
    expect(r).toEqual({ egressId: 'EG_1', recordingId: 'rec-1', fileUrl: 'https://cdn/x.mp4' });
  });

  it('returns null on edge error', async () => {
    localStorage.setItem('admin_access_token', 'tok-abc');
    invokeMock.mockResolvedValueOnce({ data: null, error: { message: 'fail' } });
    const r = await startTrackEgress({ roomName: 'r', identity: 'i', trackSid: 's' });
    expect(r).toBeNull();
  });

  it('returns null when response lacks egressId', async () => {
    localStorage.setItem('admin_access_token', 'tok-abc');
    invokeMock.mockResolvedValueOnce({ data: { other: 1 }, error: null });
    const r = await startTrackEgress({ roomName: 'r', identity: 'i', trackSid: 's' });
    expect(r).toBeNull();
  });
});

describe('Pkg113 stopTrackEgress', () => {
  it('returns false without token or egressId', async () => {
    expect(await stopTrackEgress('')).toBe(false);
    expect(await stopTrackEgress('EG_1')).toBe(false); // no token
  });

  it('invokes edge fn with stop action', async () => {
    localStorage.setItem('admin_access_token', 'tok-abc');
    invokeMock.mockResolvedValueOnce({ data: { ok: true }, error: null });
    const r = await stopTrackEgress('EG_1');
    expect(r).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith(
      'livekit-track-egress',
      expect.objectContaining({
        body: { action: 'stop', egressId: 'EG_1' },
        headers: { 'x-admin-access-token': 'tok-abc' },
      }),
    );
  });
});

describe('Pkg113 listTrackRecordings', () => {
  it('queries track_recordings via RLS', async () => {
    const limitMock = vi.fn().mockResolvedValue({ data: [{ id: 'a' }], error: null });
    const eqMock = vi.fn(() => ({ limit: limitMock }));
    const orderMock = vi.fn(() => ({ limit: limitMock, eq: eqMock }));
    const selectMock = vi.fn(() => ({ order: orderMock }));
    fromMock.mockReturnValue({ select: selectMock });

    const r = await listTrackRecordings();
    expect(fromMock).toHaveBeenCalledWith('track_recordings');
    expect(r).toEqual([{ id: 'a' }]);
  });
});
