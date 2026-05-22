import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable backing for readRoomMetadata mock so each setter merge has fresh state
const cache: { raw: string; metadata: Record<string, unknown> | null } = {
  raw: '',
  metadata: null,
};

const setRoomMetadataSpy = vi.fn(async (_scope: string, _id: string, opts: any) => {
  const md = opts.metadata;
  cache.metadata = md;
  cache.raw = md ? JSON.stringify(md) : '';
  return { ok: true };
});

vi.mock('@/lib/livekitRoomMetadata', () => ({
  readRoomMetadata: vi.fn(() => ({ raw: cache.raw, metadata: cache.metadata })),
  setRoomMetadata: (...args: any[]) => setRoomMetadataSpy(...(args as [any, any, any])),
  useRoomMetadata: vi.fn(() => ({ raw: cache.raw, metadata: cache.metadata })),
}));

import {
  ROOM_STATE_VERSION,
  readRoomState,
  setCurrentSong,
  setPinnedMessage,
  setRoomThemeState,
  setRoomPoll,
  setRoomLocked,
  setRoomTopic,
  setRoomAnnouncement,
  setRoomCustom,
  clearRoomState,
} from '@/lib/livekitRoomState';

const ref = { scope: 'live' as const, scopeId: 's1', roomName: 'live_s1' };

describe('Pkg143 standard room-state schemas on Pkg122', () => {
  beforeEach(() => {
    cache.raw = '';
    cache.metadata = null;
    setRoomMetadataSpy.mockClear();
  });

  it('readRoomState returns EMPTY with v=1 when no metadata', () => {
    expect(readRoomState('live', 'nothing')).toEqual({ v: ROOM_STATE_VERSION });
  });

  it('setCurrentSong writes versioned blob', async () => {
    await setCurrentSong(ref, { id: 'sng-1', title: 'A', artist: 'X' });
    expect(setRoomMetadataSpy).toHaveBeenCalledTimes(1);
    const [scope, id, opts] = setRoomMetadataSpy.mock.calls[0];
    expect(scope).toBe('live');
    expect(id).toBe('s1');
    expect(opts.roomName).toBe('live_s1');
    expect(opts.metadata).toMatchObject({
      v: ROOM_STATE_VERSION,
      currentSong: { id: 'sng-1', title: 'A', artist: 'X' },
    });
  });

  it('subsequent setters merge with previous state', async () => {
    await setCurrentSong(ref, { id: 'sng-1', title: 'A' });
    await setPinnedMessage(ref, { id: 'm-1', text: 'hi' });
    const md = setRoomMetadataSpy.mock.calls[1][2].metadata;
    expect(md.currentSong).toEqual({ id: 'sng-1', title: 'A' });
    expect(md.pinnedMessage).toEqual({ id: 'm-1', text: 'hi' });
  });

  it('passing null for a slice clears it from the blob', async () => {
    await setCurrentSong(ref, { id: 'sng-1', title: 'A' });
    await setCurrentSong(ref, null);
    const md = setRoomMetadataSpy.mock.calls[1][2].metadata;
    expect(md.currentSong).toBeUndefined();
    expect(md.v).toBe(ROOM_STATE_VERSION);
  });

  it('covers theme / poll / locked / topic / announcement / custom', async () => {
    await setRoomThemeState(ref, { id: 't1', name: 'Sunset', primary: '#f00' });
    await setRoomPoll(ref, {
      id: 'p1',
      question: 'Pick',
      options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
      allowMulti: false,
    });
    await setRoomLocked(ref, true);
    await setRoomTopic(ref, 'gaming night');
    await setRoomAnnouncement(ref, { text: 'starting', severity: 'info' });
    await setRoomCustom(ref, { mood: 'chill' });
    const md = setRoomMetadataSpy.mock.calls.at(-1)![2].metadata;
    expect(md.theme.name).toBe('Sunset');
    expect(md.poll.options).toHaveLength(2);
    expect(md.locked).toBe(true);
    expect(md.topic).toBe('gaming night');
    expect(md.announcement.severity).toBe('info');
    expect(md.custom).toEqual({ mood: 'chill' });
  });

  it('clearRoomState writes only the version sentinel', async () => {
    await setCurrentSong(ref, { id: 'sng-1', title: 'A' });
    await setRoomLocked(ref, true);
    await clearRoomState(ref);
    const md = setRoomMetadataSpy.mock.calls.at(-1)![2].metadata;
    expect(md).toEqual({ v: ROOM_STATE_VERSION });
  });

  it('parse keeps v pinned even if SFU returned old version', () => {
    cache.metadata = { v: 999, topic: 'old' };
    cache.raw = JSON.stringify(cache.metadata);
    const state = readRoomState('live', 'sX');
    expect(state.v).toBe(ROOM_STATE_VERSION);
    expect(state.topic).toBe('old');
  });

  it('setRoomMetadata errors propagate', async () => {
    setRoomMetadataSpy.mockImplementationOnce(async () => {
      throw new Error('room_metadata_set_failed');
    });
    await expect(setRoomTopic(ref, 'x')).rejects.toThrow('room_metadata_set_failed');
  });
});
