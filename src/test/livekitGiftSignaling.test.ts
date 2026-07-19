/**
 * Pkg76 – livekitGiftSignaling unit tests
 *
 * High-fanout gift `gift_sent` envelopes across two scopes (live, party).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoomEvent } from 'livekit-client';
import {
  registerGiftRoom,
  unregisterGiftRoom,
  publishGiftSent,
  __resetGiftSignalingRegistryForTests,
} from '@/lib/livekitGiftSignaling';
import { buildEnvelope, encodeEnvelope } from '@/lib/livekitSignaling';

function makeFakeRoom() {
  const listeners = new Map<string, Set<Function>>();
  const publishData = vi.fn().mockResolvedValue(undefined);
  return {
    state: 'connected',
    localParticipant: { identity: 'sender-1', publishData },
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
            data: { value: JSON.stringify({ call: true, live: true, party: true, gift: true, chat: true, presence: true, game: true, pk: true }) },
            error: null,
          }),
        }),
      }),
    }),
  },
}));

describe('Pkg76 livekitGiftSignaling', () => {
  beforeEach(() => {
    __resetGiftSignalingRegistryForTests();
  });

  it('registerGiftRoom binds a DataReceived listener', () => {
    const room = makeFakeRoom();
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(0);
    registerGiftRoom('live', 'stream-1', room as any);
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(1);
  });

  it('re-registering the same (scope,id) replaces the old listener', () => {
    const room = makeFakeRoom();
    registerGiftRoom('live', 'stream-1', room as any);
    registerGiftRoom('live', 'stream-1', room as any);
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(1);
  });

  it('dispatches livekit-gift-sent on matching envelope', () => {
    const room = makeFakeRoom();
    registerGiftRoom('live', 'stream-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-gift-sent', listener);

    const env = buildEnvelope('gift', 'gift_sent', {
      scope: 'live',
      id: 'stream-1',
      senderId: 'sender-1',
      giftName: 'Rose',
      count: 3,
      giftDiamonds: 10,
      receiverBeans: 27,
    }, 'sender-1');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 'sender-1' });

    expect(listener).toHaveBeenCalledOnce();
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.scope).toBe('live');
    expect(detail.id).toBe('stream-1');
    expect(detail.giftName).toBe('Rose');
    expect(detail.count).toBe(3);
    expect(detail.receiverBeans).toBe(27);
    window.removeEventListener('livekit-gift-sent', listener);
  });

  it('ignores envelopes targeted at a different scope/id', () => {
    const room = makeFakeRoom();
    registerGiftRoom('live', 'stream-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-gift-sent', listener);

    // Wrong id
    let env = buildEnvelope('gift', 'gift_sent', {
      scope: 'live', id: 'stream-OTHER', senderId: 's',
    }, 's');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 's' });

    // Wrong scope
    env = buildEnvelope('gift', 'gift_sent', {
      scope: 'party', id: 'stream-1', senderId: 's',
    }, 's');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 's' });

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('livekit-gift-sent', listener);
  });

  it('ignores envelopes from a different family (live)', () => {
    const room = makeFakeRoom();
    registerGiftRoom('live', 'stream-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-gift-sent', listener);

    const env = buildEnvelope('live', 'stream_ended', {
      streamId: 'stream-1',
      endedBy: 'someone',
    }, 'someone');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 'someone' });

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('livekit-gift-sent', listener);
  });

  it('same (scope,id) gift envelope is delivered exactly once (dedupe)', () => {
    const room = makeFakeRoom();
    registerGiftRoom('party', 'party-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-gift-sent', listener);

    const env = buildEnvelope('gift', 'gift_sent', {
      scope: 'party', id: 'party-1', senderId: 's',
    }, 's');
    const bytes = encodeEnvelope(env);
    // Same envelope id arrives twice — dedupe should drop the second.
    room.__emit(RoomEvent.DataReceived, bytes, { identity: 's' });
    room.__emit(RoomEvent.DataReceived, bytes, { identity: 's' });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('livekit-gift-sent', listener);
  });

  it('unregisterGiftRoom removes the listener', () => {
    const room = makeFakeRoom();
    registerGiftRoom('live', 'stream-1', room as any);
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(1);
    unregisterGiftRoom('live', 'stream-1');
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(0);
  });

  it('publishGiftSent sends an encoded envelope on the bound room', async () => {
    const room = makeFakeRoom();
    registerGiftRoom('live', 'stream-1', room as any);

    const ok = await publishGiftSent('live', 'stream-1', {
      senderId: 'sender-1',
      giftName: 'Rose',
      count: 1,
      giftDiamonds: 10,
    });
    expect(ok).toBe(true);
    expect(room.__publishData).toHaveBeenCalledOnce();
    const [bytes, opts] = room.__publishData.mock.calls[0];
    expect(bytes && typeof (bytes as any).byteLength === 'number').toBe(true);
    expect(opts).toEqual({ reliable: true });
  });

  it('publishGiftSent returns false when (scope,id) is unknown', async () => {
    const ok = await publishGiftSent('live', 'does-not-exist', {
      senderId: 'me',
    });
    expect(ok).toBe(false);
  });

  it('publishGiftSent returns false when room is not connected', async () => {
    const room = makeFakeRoom();
    (room as any).state = 'disconnected';
    registerGiftRoom('party', 'party-2', room as any);
    const ok = await publishGiftSent('party', 'party-2', {
      senderId: 'me',
    });
    expect(ok).toBe(false);
  });
});
