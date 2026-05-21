/**
 * Pkg74 – livekitLiveSignaling unit tests
 *
 * Mirror of Pkg73 specs but for live-stream `stream_ended` envelopes.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoomEvent } from 'livekit-client';
import {
  registerStreamRoom,
  unregisterStreamRoom,
  publishStreamEnded,
  __resetLiveSignalingRegistryForTests,
} from '@/lib/livekitLiveSignaling';
import { buildEnvelope, encodeEnvelope } from '@/lib/livekitSignaling';

function makeFakeRoom() {
  const listeners = new Map<string, Set<Function>>();
  const publishData = vi.fn().mockResolvedValue(undefined);
  return {
    state: 'connected',
    localParticipant: { identity: 'host-1', publishData },
    on(evt: string, fn: Function) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt)!.add(fn);
      return this;
    },
    off(evt: string, fn: Function) {
      listeners.get(evt)?.delete(fn);
      return this;
    },
    __emit(evt: string, ...args: any[]) {
      listeners.get(evt)?.forEach((fn) => fn(...args));
    },
    __publishData: publishData,
    __listenerCount(evt: string) {
      return listeners.get(evt)?.size ?? 0;
    },
  };
}

// Seed kill-switch cache to ON via direct import of internal helpers.
// publishStreamEnded reads `isLiveKitEnabled('live')`. We monkey-patch the
// cache by short-circuiting the DB read via mocking the supabase client.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { value: JSON.stringify({ call: true, live: true, party: true, gift: true, chat: true, presence: true, game: true, pk: true }) },
            error: null,
          }),
        }),
      }),
    }),
  },
}));

describe('Pkg74 livekitLiveSignaling', () => {
  beforeEach(() => {
    __resetLiveSignalingRegistryForTests();
  });

  it('registerStreamRoom binds a DataReceived listener', () => {
    const room = makeFakeRoom();
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(0);
    registerStreamRoom('stream-1', room as any);
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(1);
  });

  it('re-registering the same streamId replaces the old listener', () => {
    const room = makeFakeRoom();
    registerStreamRoom('stream-1', room as any);
    registerStreamRoom('stream-1', room as any);
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(1);
  });

  it('dispatches livekit-stream-ended on matching envelope', () => {
    const room = makeFakeRoom();
    registerStreamRoom('stream-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-stream-ended', listener);

    const env = buildEnvelope('live', 'stream_ended', {
      streamId: 'stream-1',
      endedBy: 'host-1',
      hostName: 'Alice',
    }, 'host-1');
    const bytes = encodeEnvelope(env);
    room.__emit(RoomEvent.DataReceived, bytes, { identity: 'host-1' });

    expect(listener).toHaveBeenCalledOnce();
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.streamId).toBe('stream-1');
    expect(detail.hostName).toBe('Alice');
    window.removeEventListener('livekit-stream-ended', listener);
  });

  it('ignores envelopes targeted at a different streamId', () => {
    const room = makeFakeRoom();
    registerStreamRoom('stream-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-stream-ended', listener);

    const env = buildEnvelope('live', 'stream_ended', {
      streamId: 'stream-OTHER',
      endedBy: 'host-x',
    }, 'host-x');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 'host-x' });

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('livekit-stream-ended', listener);
  });

  it('ignores envelopes from a different family (call)', () => {
    const room = makeFakeRoom();
    registerStreamRoom('stream-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-stream-ended', listener);

    const env = buildEnvelope('call', 'call_ended', {
      callId: 'stream-1',
      endedBy: 'someone',
    }, 'someone');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 'someone' });

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('livekit-stream-ended', listener);
  });

  it('unregisterStreamRoom removes the listener', () => {
    const room = makeFakeRoom();
    registerStreamRoom('stream-1', room as any);
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(1);
    unregisterStreamRoom('stream-1');
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(0);
  });

  it('publishStreamEnded sends an encoded envelope on the bound room', async () => {
    const room = makeFakeRoom();
    registerStreamRoom('stream-1', room as any);

    const ok = await publishStreamEnded('stream-1', {
      endedBy: 'host-1',
      hostName: 'Alice',
    });
    expect(ok).toBe(true);
    expect(room.__publishData).toHaveBeenCalledOnce();
    const [bytes, opts] = room.__publishData.mock.calls[0];
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(opts).toEqual({ reliable: true });
  });

  it('publishStreamEnded returns false when room is unknown', async () => {
    const ok = await publishStreamEnded('does-not-exist', { endedBy: 'me' });
    expect(ok).toBe(false);
  });

  it('publishStreamEnded returns false when room is not connected', async () => {
    const room = makeFakeRoom();
    (room as any).state = 'disconnected';
    registerStreamRoom('stream-2', room as any);
    const ok = await publishStreamEnded('stream-2', { endedBy: 'me' });
    expect(ok).toBe(false);
  });
});
