/**
 * Pkg75 – livekitPartySignaling unit tests
 *
 * Mirror of Pkg73/Pkg74 specs but for party-room `room_closed` envelopes.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoomEvent } from 'livekit-client';
import {
  registerPartyRoom,
  unregisterPartyRoom,
  publishPartyClosed,
  __resetPartySignalingRegistryForTests,
} from '@/lib/livekitPartySignaling';
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

describe('Pkg75 livekitPartySignaling', () => {
  beforeEach(() => {
    __resetPartySignalingRegistryForTests();
  });

  it('registerPartyRoom binds a DataReceived listener', () => {
    const room = makeFakeRoom();
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(0);
    registerPartyRoom('party-1', room as any);
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(1);
  });

  it('re-registering the same roomId replaces the old listener', () => {
    const room = makeFakeRoom();
    registerPartyRoom('party-1', room as any);
    registerPartyRoom('party-1', room as any);
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(1);
  });

  it('dispatches livekit-party-closed on matching envelope', () => {
    const room = makeFakeRoom();
    registerPartyRoom('party-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-party-closed', listener);

    const env = buildEnvelope('party', 'room_closed', {
      roomId: 'party-1',
      hostId: 'host-1',
      closedAt: new Date().toISOString(),
    }, 'host-1');
    const bytes = encodeEnvelope(env);
    room.__emit(RoomEvent.DataReceived, bytes, { identity: 'host-1' });

    expect(listener).toHaveBeenCalledOnce();
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.roomId).toBe('party-1');
    expect(detail.hostId).toBe('host-1');
    window.removeEventListener('livekit-party-closed', listener);
  });

  it('ignores envelopes targeted at a different roomId', () => {
    const room = makeFakeRoom();
    registerPartyRoom('party-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-party-closed', listener);

    const env = buildEnvelope('party', 'room_closed', {
    }, 'host-x');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 'host-x' });

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('livekit-party-closed', listener);
  });

  it('ignores envelopes from a different family (live)', () => {
    const room = makeFakeRoom();
    registerPartyRoom('party-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-party-closed', listener);

    const env = buildEnvelope('live', 'stream_ended', {
      streamId: 'party-1',
      endedBy: 'someone',
    }, 'someone');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 'someone' });

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('livekit-party-closed', listener);
  });

  it('unregisterPartyRoom removes the listener', () => {
    const room = makeFakeRoom();
    registerPartyRoom('party-1', room as any);
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(1);
    unregisterPartyRoom('party-1');
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(0);
  });

  it('publishPartyClosed sends an encoded envelope on the bound room', async () => {
    const room = makeFakeRoom();
    registerPartyRoom('party-1', room as any);

    const ok = await publishPartyClosed('party-1', {
    });
    expect(ok).toBe(true);
    expect(room.__publishData).toHaveBeenCalledOnce();
    const [bytes, opts] = room.__publishData.mock.calls[0];
    expect(bytes && typeof (bytes as any).byteLength === 'number').toBe(true);
    expect(opts).toEqual({ reliable: true });
  });

  it('publishPartyClosed returns false when room is unknown', async () => {
    const ok = await publishPartyClosed('does-not-exist', {
    });
    expect(ok).toBe(false);
  });

  it('publishPartyClosed returns false when room is not connected', async () => {
    const room = makeFakeRoom();
    (room as any).state = 'disconnected';
    registerPartyRoom('party-2', room as any);
    const ok = await publishPartyClosed('party-2', {
    });
    expect(ok).toBe(false);
  });
});
