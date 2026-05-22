// Pkg131: raise-hand client unit tests.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const readLocalMock = vi.fn();
const readPartMock = vi.fn();
const setLocalMock = vi.fn();
vi.mock('@/lib/livekitMetadata', () => ({
  readLocalMetadata: (...a: unknown[]) => readLocalMock(...a),
  readParticipantMetadata: (...a: unknown[]) => readPartMock(...a),
  setLocalParticipantMetadata: (...a: unknown[]) => setLocalMock(...a),
}));

import {
  raiseHand,
  lowerHand,
  hasRaisedHand,
  useRaisedHands,
  __resetRaiseHandForTests,
} from '@/lib/livekitRaiseHand';

function fireMeta(
  scope: string,
  id: string,
  identity: string,
  metadata: Record<string, unknown> | null,
) {
  window.dispatchEvent(
    new CustomEvent('livekit-participant-metadata', {
      detail: { scope, id, identity, metadata },
    }),
  );
}

describe('Pkg131 raise-hand', () => {
  beforeEach(() => {
    readLocalMock.mockReset();
    readPartMock.mockReset();
    setLocalMock.mockReset();
    __resetRaiseHandForTests();
  });

  it('raiseHand returns false on missing scope/id', async () => {
    expect(await raiseHand('' as never, 'r')).toBe(false);
    expect(await raiseHand('live' as never, '')).toBe(false);
    expect(setLocalMock).not.toHaveBeenCalled();
  });

  it('raiseHand merges over existing metadata + stamps raisedAt', async () => {
    readLocalMock.mockReturnValue({ afk: true, theme: 'dark' });
    setLocalMock.mockResolvedValue(true);
    const before = Date.now();
    const ok = await raiseHand('live' as never, 'r1');
    expect(ok).toBe(true);
    const [, , payload] = setLocalMock.mock.calls[0];
    expect(payload.afk).toBe(true);
    expect(payload.theme).toBe('dark');
    expect(payload.raisedHand).toBe(true);
    expect(payload.raisedAt).toBeGreaterThanOrEqual(before);
    expect(payload.raiseReason).toBeUndefined();
  });

  it('raiseHand trims + truncates reason to 120 chars', async () => {
    readLocalMock.mockReturnValue({});
    setLocalMock.mockResolvedValue(true);
    const long = '   ' + 'x'.repeat(500) + '   ';
    await raiseHand('party' as never, 'rid', { reason: long });
    const [, , payload] = setLocalMock.mock.calls[0];
    expect(payload.raiseReason).toBe('x'.repeat(120));
  });

  it('raiseHand drops reason when empty/whitespace', async () => {
    readLocalMock.mockReturnValue({ raiseReason: 'old' });
    setLocalMock.mockResolvedValue(true);
    await raiseHand('live' as never, 'r1', { reason: '   ' });
    const [, , payload] = setLocalMock.mock.calls[0];
    expect(payload.raiseReason).toBeUndefined();
  });

  it('lowerHand clears only the 3 raise keys, preserves others', async () => {
    readLocalMock.mockReturnValue({
      afk: false,
      theme: 'light',
      raisedHand: true,
      raisedAt: 123,
      raiseReason: 'pls',
    });
    setLocalMock.mockResolvedValue(true);
    await lowerHand('live' as never, 'r1');
    const [, , payload] = setLocalMock.mock.calls[0];
    expect(payload).toEqual({ afk: false, theme: 'light' });
  });

  it('hasRaisedHand returns true only when key === true', () => {
    readPartMock.mockReturnValueOnce({ raisedHand: true });
    expect(hasRaisedHand('live' as never, 'r', 'u1')).toBe(true);
    readPartMock.mockReturnValueOnce({ raisedHand: false });
    expect(hasRaisedHand('live' as never, 'r', 'u1')).toBe(false);
    readPartMock.mockReturnValueOnce(null);
    expect(hasRaisedHand('live' as never, 'r', 'u1')).toBe(false);
  });

  it('useRaisedHands collects raises in FIFO order', () => {
    const { result } = renderHook(() => useRaisedHands('live' as never, 'r1'));
    expect(result.current).toEqual([]);
    act(() => {
      fireMeta('live', 'r1', 'u-late', { raisedHand: true, raisedAt: 200 });
      fireMeta('live', 'r1', 'u-early', { raisedHand: true, raisedAt: 100 });
      fireMeta('live', 'r1', 'u-mid', {
        raisedHand: true,
        raisedAt: 150,
        raiseReason: 'mic test',
      });
    });
    expect(result.current.map((h) => h.identity)).toEqual([
      'u-early',
      'u-mid',
      'u-late',
    ]);
    expect(result.current[1].reason).toBe('mic test');
  });

  it('useRaisedHands removes identity when raised flips false / missing', () => {
    const { result } = renderHook(() => useRaisedHands('party' as never, 'p1'));
    act(() => {
      fireMeta('party', 'p1', 'u1', { raisedHand: true, raisedAt: 100 });
      fireMeta('party', 'p1', 'u2', { raisedHand: true, raisedAt: 200 });
    });
    expect(result.current).toHaveLength(2);
    act(() => {
      fireMeta('party', 'p1', 'u1', { raisedHand: false, raisedAt: 100 });
    });
    expect(result.current.map((h) => h.identity)).toEqual(['u2']);
    act(() => {
      fireMeta('party', 'p1', 'u2', { afk: true });
    });
    expect(result.current).toEqual([]);
  });

  it('useRaisedHands ignores events for other scope/id', () => {
    const { result } = renderHook(() => useRaisedHands('live' as never, 'r1'));
    act(() => {
      fireMeta('party', 'r1', 'u1', { raisedHand: true, raisedAt: 1 });
      fireMeta('live', 'r2', 'u2', { raisedHand: true, raisedAt: 2 });
    });
    expect(result.current).toEqual([]);
  });

  it('useRaisedHands seeds from cache when re-mounted', () => {
    // First mount populates the shared queue cache.
    const first = renderHook(() => useRaisedHands('live' as never, 'rseed'));
    act(() => {
      fireMeta('live', 'rseed', 'a', { raisedHand: true, raisedAt: 10 });
    });
    expect(first.result.current).toHaveLength(1);
    first.unmount();

    // Re-mount must show the cached entry instantly without a new event.
    const second = renderHook(() => useRaisedHands('live' as never, 'rseed'));
    expect(second.result.current).toEqual([
      { identity: 'a', raisedAt: 10, reason: undefined },
    ]);
  });

  it('useRaisedHands returns [] when scope/id missing', () => {
    const { result } = renderHook(() => useRaisedHands(undefined, undefined));
    expect(result.current).toEqual([]);
  });
});
