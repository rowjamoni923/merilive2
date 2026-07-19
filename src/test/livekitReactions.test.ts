// Pkg132: floating-reactions client unit tests.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const isEnabledMock = vi.fn();
vi.mock('@/lib/livekitSignaling', async () => {
  const actual = await vi.importActual<typeof import('@/lib/livekitSignaling')>(
    '@/lib/livekitSignaling',
  );
  return {
    ...actual,
    isLiveKitEnabled: (...a: unknown[]) => isEnabledMock(...a),
  };
});

const nativeSendMock = vi.fn();
const nativeOnDataMock = vi.fn();
vi.mock('@/lib/nativeLiveKitController', () => ({
  nativeLiveKitController: {
    sendData: (...a: unknown[]) => nativeSendMock(...a),
    onDataReceived: (...a: unknown[]) => nativeOnDataMock(...a),
  },
}));

import {
  publishReaction,
  registerReactionRoom,
  unregisterReactionRoom,
  useReactions,
  __resetReactionsForTests,
} from '@/lib/livekitReactions';
import {
  buildEnvelope,
  encodeEnvelope,
} from '@/lib/livekitSignaling';

type Handler = (payload: Uint8Array, p?: { identity: string }) => void;

function makeFakeRoom() {
  let handler: Handler | null = null;
  const publishData = vi.fn().mockResolvedValue(undefined);
  const room = {
    state: 'connected',
    localParticipant: { identity: 'local-1', publishData },
    on: vi.fn((_evt: string, h: Handler) => {
      handler = h;
    }),
    off: vi.fn(() => {
      handler = null;
    }),
  };
  return {
    room: room as unknown as import('livekit-client').Room,
    publishData,
    emit: (bytes: Uint8Array, identity = 'peer-2') => handler?.(bytes, { identity }),
  };
}

describe('Pkg132 reactions', () => {
  beforeEach(() => {
    isEnabledMock.mockReset();
    nativeSendMock.mockReset();
    nativeOnDataMock.mockReset();
    __resetReactionsForTests();
  });

  afterEach(() => {
    __resetReactionsForTests();
  });

  it('publishReaction returns false without an id', async () => {
    expect(await publishReaction('live', '', '🔥')).toBe(false);
  });

  it('publishReaction returns false on empty/whitespace emoji', async () => {
    const f = makeFakeRoom();
    registerReactionRoom('live', 'r1', f.room);
    expect(await publishReaction('live', 'r1', '   ')).toBe(false);
    expect(f.publishData).not.toHaveBeenCalled();
  });

  it('publishReaction returns false when no room and no native', async () => {
    expect(await publishReaction('live', 'r1', '🔥')).toBe(false);
  });

  it('publishReaction returns false when kill-switch OFF', async () => {
    const f = makeFakeRoom();
    registerReactionRoom('live', 'r1', f.room);
    isEnabledMock.mockResolvedValue(false);
    expect(await publishReaction('live', 'r1', '🔥')).toBe(false);
    expect(f.publishData).not.toHaveBeenCalled();
  });

  it('publishReaction sends unreliable DataPacket when allowed', async () => {
    const f = makeFakeRoom();
    registerReactionRoom('live', 'r1', f.room);
    isEnabledMock.mockResolvedValue(true);
    expect(await publishReaction('live', 'r1', '❤️')).toBe(true);
    expect(f.publishData).toHaveBeenCalledTimes(1);
    const [, opts] = f.publishData.mock.calls[0];
    expect(opts).toEqual({ reliable: false });
  });

  it('rate limit caps outgoing reactions per 1.5s window', async () => {
    const f = makeFakeRoom();
    registerReactionRoom('live', 'r1', f.room);
    isEnabledMock.mockResolvedValue(true);
    const results: boolean[] = [];
    for (let i = 0; i < 15; i++) results.push(await publishReaction('live', 'r1', '🔥'));
    const ok = results.filter(Boolean).length;
    expect(ok).toBe(10);
  });

  it('incoming envelope dispatches window event matching scope+id', async () => {
    const f = makeFakeRoom();
    registerReactionRoom('party', 'p1', f.room);
    const detail = vi.fn();
    window.addEventListener('livekit-reaction', (e) => detail((e as CustomEvent).detail));

    const env = buildEnvelope('reactions', 'reaction', {
      scope: 'party',
      id: 'p1',
      senderId: 'peer-2',
      emoji: '🎉',
      timestamp: Date.now(),
    });
    f.emit(encodeEnvelope(env));
    expect(detail).toHaveBeenCalledTimes(1);
    const d = detail.mock.calls[0][0];
    expect(d.emoji).toBe('🎉');
    expect(d.scope).toBe('party');
    expect(d.id).toBe('p1');
    expect(d.senderIdentity).toBe('peer-2');
  });

  it('envelope mismatched scope is ignored', async () => {
    const f = makeFakeRoom();
    registerReactionRoom('live', 'r1', f.room);
    const detail = vi.fn();
    window.addEventListener('livekit-reaction', () => detail());

    const env = buildEnvelope('reactions', 'reaction', {
      scope: 'party',
      id: 'r1',
      senderId: 'x',
      emoji: '🔥',
    });
    f.emit(encodeEnvelope(env));
    expect(detail).not.toHaveBeenCalled();
  });

  it('unregisterReactionRoom detaches the handler', () => {
    const f = makeFakeRoom();
    registerReactionRoom('call', 'c1', f.room);
    unregisterReactionRoom('call', 'c1');
    expect(f.room.off).toHaveBeenCalled();
  });

  it('useReactions buffers incoming entries and expires after ttl', async () => {
    vi.useFakeTimers();
    try {
      const f = makeFakeRoom();
      registerReactionRoom('live', 'r2', f.room);
      const { result } = renderHook(() => useReactions('live', 'r2', 1000));

      act(() => {
        const env = buildEnvelope('reactions', 'reaction', {
          scope: 'live',
          id: 'r2',
          senderId: 'peer-2',
          emoji: '👍',
        });
        f.emit(encodeEnvelope(env));
      });
      expect(result.current.length).toBe(1);
      expect(result.current[0].emoji).toBe('👍');

      act(() => {
        vi.advanceTimersByTime(1100);
      });
      expect(result.current.length).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('emoji longer than MAX_EMOJI_LEN is truncated on receive', async () => {
    const f = makeFakeRoom();
    registerReactionRoom('live', 'r3', f.room);
    const detail = vi.fn();
    window.addEventListener('livekit-reaction', (e) => detail((e as CustomEvent).detail));

    const long = '🔥'.repeat(50);
    const env = buildEnvelope('reactions', 'reaction', {
      scope: 'live',
      id: 'r3',
      senderId: 'peer',
      emoji: long,
    });
    f.emit(encodeEnvelope(env));
    expect(detail).toHaveBeenCalledTimes(1);
    expect(detail.mock.calls[0][0].emoji.length).toBeLessThanOrEqual(16);
  });
});
