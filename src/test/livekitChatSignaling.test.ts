/**
 * Pkg79 – livekitChatSignaling unit tests
 *
 * In-room chat over LiveKit DataPackets, scopes: call / live / party.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoomEvent } from 'livekit-client';
import {
  registerChatRoom,
  unregisterChatRoom,
  publishChatMessage,
  __resetChatSignalingRegistryForTests,
} from '@/lib/livekitChatSignaling';
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

describe('Pkg79 livekitChatSignaling', () => {
  beforeEach(() => {
    __resetChatSignalingRegistryForTests();
  });

  it('registerChatRoom binds a DataReceived listener', () => {
    const room = makeFakeRoom();
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(0);
    registerChatRoom('live', 'stream-1', room as any);
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(1);
  });

  it('re-registering the same (scope,id) replaces the old listener', () => {
    const room = makeFakeRoom();
    registerChatRoom('call', 'call-1', room as any);
    registerChatRoom('call', 'call-1', room as any);
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(1);
  });

  it('dispatches livekit-chat-message on matching envelope', () => {
    const room = makeFakeRoom();
    registerChatRoom('live', 'stream-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-chat-message', listener);

    const env = buildEnvelope('chat', 'chat_message', {
      scope: 'live',
      id: 'stream-1',
      messageId: 'msg-1',
      userId: 'user-1',
      displayName: 'Alice',
      message: 'hello',
      messageType: 'text',
    }, 'user-1');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 'user-1' });

    expect(listener).toHaveBeenCalledOnce();
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.scope).toBe('live');
    expect(detail.id).toBe('stream-1');
    expect(detail.message).toBe('hello');
    expect(detail.userId).toBe('user-1');
    window.removeEventListener('livekit-chat-message', listener);
  });

  it('ignores envelopes targeted at a different scope/id', () => {
    const room = makeFakeRoom();
    registerChatRoom('live', 'stream-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-chat-message', listener);

    // Wrong id
    let env = buildEnvelope('chat', 'chat_message', {
    }, 'u');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 'u' });

    // Wrong scope
    env = buildEnvelope('chat', 'chat_message', {
    }, 'u');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 'u' });

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('livekit-chat-message', listener);
  });

  it('ignores envelopes from a different family', () => {
    const room = makeFakeRoom();
    registerChatRoom('live', 'stream-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-chat-message', listener);

    const env = buildEnvelope('gift', 'gift_sent', {
    }, 's');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 's' });

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('livekit-chat-message', listener);
  });

  it('drops envelopes missing required fields', () => {
    const room = makeFakeRoom();
    registerChatRoom('call', 'call-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-chat-message', listener);

    // missing message
    const env = buildEnvelope('chat', 'chat_message', {
    } as any, 'u');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 'u' });

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('livekit-chat-message', listener);
  });

  it('same envelope id is delivered exactly once (dedupe)', () => {
    const room = makeFakeRoom();
    registerChatRoom('party', 'party-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-chat-message', listener);

    const env = buildEnvelope('chat', 'chat_message', {
    }, 'u');
    const bytes = encodeEnvelope(env);
    room.__emit(RoomEvent.DataReceived, bytes, { identity: 'u' });
    room.__emit(RoomEvent.DataReceived, bytes, { identity: 'u' });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('livekit-chat-message', listener);
  });

  it('unregisterChatRoom removes the listener', () => {
    const room = makeFakeRoom();
    registerChatRoom('live', 'stream-1', room as any);
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(1);
    unregisterChatRoom('live', 'stream-1');
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(0);
  });

  it('publishChatMessage sends an encoded envelope on the bound room', async () => {
    const room = makeFakeRoom();
    registerChatRoom('call', 'call-1', room as any);

    const ok = await publishChatMessage('call', 'call-1', {
    });
    expect(ok).toBe(true);
    expect(room.__publishData).toHaveBeenCalledOnce();
    const [bytes, opts] = room.__publishData.mock.calls[0];
    expect(bytes && typeof (bytes as any).byteLength === 'number').toBe(true);
    expect(opts).toEqual({ reliable: true });
  });

  it('publishChatMessage returns false when (scope,id) is unknown', async () => {
    const ok = await publishChatMessage('live', 'does-not-exist', {
    });
    expect(ok).toBe(false);
  });

  it('publishChatMessage returns false when required fields missing', async () => {
    const room = makeFakeRoom();
    registerChatRoom('live', 'stream-1', room as any);
    const ok = await publishChatMessage('live', 'stream-1', {
    });
    expect(ok).toBe(false);
  });

  it('publishChatMessage returns false when room is not connected', async () => {
    const room = makeFakeRoom();
    (room as any).state = 'disconnected';
    registerChatRoom('party', 'party-2', room as any);
    const ok = await publishChatMessage('party', 'party-2', {
    });
    expect(ok).toBe(false);
  });
});
