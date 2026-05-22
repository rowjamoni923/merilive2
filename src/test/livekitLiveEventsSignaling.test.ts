/**
 * Pkg82a – livekitLiveEventsSignaling unit tests
 *
 * Mirror of Pkg80 spec but for live-stream viewer presence events
 * (viewer_joined + viewer_left).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoomEvent } from 'livekit-client';
import {
  registerLiveEventsRoom,
  unregisterLiveEventsRoom,
  publishLiveEvent,
  publishViewerJoined,
  __resetLiveEventsRegistryForTests,
} from '@/lib/livekitLiveEventsSignaling';
import { buildEnvelope, encodeEnvelope } from '@/lib/livekitSignaling';

function makeFakeRoom() {
  const listeners = new Map<string, Set<Function>>();
  const publishData = vi.fn().mockResolvedValue(undefined);
  return {
    state: 'connected',
    localParticipant: { identity: 'viewer-1', publishData },
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

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              value: JSON.stringify({
                call: true, live: true, party: true, gift: true,
                chat: true, presence: true, game: true, pk: true,
              }),
            },
            error: null,
          }),
        }),
      }),
    }),
  },
}));

describe('Pkg82a livekitLiveEventsSignaling', () => {
  beforeEach(() => {
    __resetLiveEventsRegistryForTests();
  });

  it('registerLiveEventsRoom binds DataReceived + ParticipantDisconnected', () => {
    const room = makeFakeRoom();
    registerLiveEventsRoom('stream-1', room as any);
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(1);
    expect(room.__listenerCount(RoomEvent.ParticipantDisconnected)).toBe(1);
  });

  it('re-registering same streamId replaces listeners', () => {
    const room = makeFakeRoom();
    registerLiveEventsRoom('stream-1', room as any);
    registerLiveEventsRoom('stream-1', room as any);
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(1);
    expect(room.__listenerCount(RoomEvent.ParticipantDisconnected)).toBe(1);
  });

  it('unregisterLiveEventsRoom removes listeners', () => {
    const room = makeFakeRoom();
    registerLiveEventsRoom('stream-1', room as any);
    unregisterLiveEventsRoom('stream-1');
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(0);
    expect(room.__listenerCount(RoomEvent.ParticipantDisconnected)).toBe(0);
  });

  it('dispatches livekit-live-event for viewer_joined envelope', () => {
    const room = makeFakeRoom();
    registerLiveEventsRoom('stream-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-live-event', listener);

    const env = buildEnvelope(
      'live',
      'viewer_joined',
      {
        type: 'viewer_joined',
        streamId: 'stream-1',
        userId: 'u-9',
        userName: 'Alice',
        userLevel: 7,
        timestamp: Date.now(),
      },
      'viewer-9',
    );
    const bytes = encodeEnvelope(env);
    room.__emit(RoomEvent.DataReceived, bytes, { identity: 'viewer-9' });

    expect(listener).toHaveBeenCalledTimes(1);
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.payload.type).toBe('viewer_joined');
    expect(detail.payload.userName).toBe('Alice');
    window.removeEventListener('livekit-live-event', listener);
  });

  it('ignores envelopes for a different streamId', () => {
    const room = makeFakeRoom();
    registerLiveEventsRoom('stream-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-live-event', listener);

    const env = buildEnvelope(
      'live',
      'viewer_joined',
      {
        type: 'viewer_joined',
        streamId: 'stream-OTHER',
        userId: 'u-9',
        userName: 'Bob',
        userLevel: 1,
        timestamp: Date.now(),
      },
      'viewer-9',
    );
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 'viewer-9' });
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('livekit-live-event', listener);
  });

  it('ParticipantDisconnected dispatches viewer_left synthetic event', () => {
    const room = makeFakeRoom();
    registerLiveEventsRoom('stream-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-live-event', listener);

    room.__emit(RoomEvent.ParticipantDisconnected, { identity: 'u-7' });
    expect(listener).toHaveBeenCalledTimes(1);
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.payload.type).toBe('viewer_left');
    expect(detail.payload.userId).toBe('u-7');
    expect(detail.payload.streamId).toBe('stream-1');
    window.removeEventListener('livekit-live-event', listener);
  });

  it('publishLiveEvent returns false when room is not registered', async () => {
    const ok = await publishLiveEvent('unknown-stream', {
      type: 'viewer_joined',
      streamId: 'unknown-stream',
      userId: 'u',
      userName: 'X',
      userLevel: 1,
      timestamp: Date.now(),
    });
    expect(ok).toBe(false);
  });

  it('publishViewerJoined sends a DataPacket when registered', async () => {
    const room = makeFakeRoom();
    registerLiveEventsRoom('stream-1', room as any);
    const ok = await publishViewerJoined('stream-1', {
      userId: 'u-1',
      userName: 'Alice',
      userLevel: 3,
    });
    expect(ok).toBe(true);
    expect(room.__publishData).toHaveBeenCalledTimes(1);
    const [, opts] = room.__publishData.mock.calls[0];
    expect(opts).toEqual({ reliable: false });
  });

  it('ignores envelopes from a different family (party)', () => {
    const room = makeFakeRoom();
    registerLiveEventsRoom('stream-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-live-event', listener);

    const env = buildEnvelope(
      'party',
      'participant_joined',
      { type: 'participant_joined', roomId: 'stream-1', userId: 'x', userName: 'y', userLevel: 1, timestamp: Date.now() } as any,
      'sender',
    );
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 'sender' });
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('livekit-live-event', listener);
  });
});
