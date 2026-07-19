/**
 * Pkg80 – livekitPartyEventsSignaling unit tests
 *
 * Mirror of Pkg75 spec but for party-room ephemeral events
 * (participant_joined + seat_action).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoomEvent } from 'livekit-client';
import {
  registerPartyEventsRoom,
  unregisterPartyEventsRoom,
  publishPartyEvent,
  __resetPartyEventsRegistryForTests,
} from '@/lib/livekitPartyEventsSignaling';
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

describe('Pkg80 livekitPartyEventsSignaling', () => {
  beforeEach(() => {
    __resetPartyEventsRegistryForTests();
  });

  it('registerPartyEventsRoom binds a DataReceived listener', () => {
    const room = makeFakeRoom();
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(0);
    registerPartyEventsRoom('party-1', room as any);
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(1);
  });

  it('re-registering the same roomId replaces the old listener', () => {
    const room = makeFakeRoom();
    registerPartyEventsRoom('party-1', room as any);
    registerPartyEventsRoom('party-1', room as any);
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(1);
  });

  it('dispatches livekit-party-event for participant_joined', () => {
    const room = makeFakeRoom();
    registerPartyEventsRoom('party-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-party-event', listener);

    const env = buildEnvelope('party', 'participant_joined', {
      type: 'participant_joined',
      roomId: 'party-1',
      userId: 'user-9',
      userName: 'Bob',
      userLevel: 7,
      timestamp: Date.now(),
    }, 'user-9');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 'user-9' });

    expect(listener).toHaveBeenCalledOnce();
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.payload.type).toBe('participant_joined');
    expect(detail.payload.userName).toBe('Bob');
    expect(detail.sender).toBe('user-9');
    window.removeEventListener('livekit-party-event', listener);
  });

  it('dispatches livekit-party-event for seat_action approved', () => {
    const room = makeFakeRoom();
    registerPartyEventsRoom('party-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-party-event', listener);

    const env = buildEnvelope('party', 'seat_action', {
      action: 'approved',
      requester_id: 'user-2',
      seat_position: 3,
      request_id: 'req-xyz',
    }, 'host-1');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 'host-1' });

    expect(listener).toHaveBeenCalledOnce();
    const detail = (listener.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.payload.action).toBe('approved');
    expect(detail.payload.seat_position).toBe(3);
    window.removeEventListener('livekit-party-event', listener);
  });

  it('ignores envelopes targeted at a different roomId', () => {
    const room = makeFakeRoom();
    registerPartyEventsRoom('party-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-party-event', listener);

    const env = buildEnvelope('party', 'seat_action', {
    }, 'host-x');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 'host-x' });

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('livekit-party-event', listener);
  });

  it('ignores envelopes from a different family (live)', () => {
    const room = makeFakeRoom();
    registerPartyEventsRoom('party-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-party-event', listener);

    const env = buildEnvelope('live', 'stream_ended', {
      streamId: 'party-1',
      endedBy: 'someone',
    }, 'someone');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 'someone' });

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('livekit-party-event', listener);
  });

  it('ignores envelopes where t and payload.type disagree', () => {
    const room = makeFakeRoom();
    registerPartyEventsRoom('party-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-party-event', listener);

    const env = buildEnvelope('party', 'seat_action', {
    }, 'x');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 'x' });

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('livekit-party-event', listener);
  });

  it('unregisterPartyEventsRoom removes the listener', () => {
    const room = makeFakeRoom();
    registerPartyEventsRoom('party-1', room as any);
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(1);
    unregisterPartyEventsRoom('party-1');
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(0);
  });

  it('publishPartyEvent sends an encoded envelope on the bound room', async () => {
    const room = makeFakeRoom();
    registerPartyEventsRoom('party-1', room as any);

    const ok = await publishPartyEvent('party-1', {
      requester_name: 'Alice',
    });
    expect(ok).toBe(true);
    expect(room.__publishData).toHaveBeenCalledOnce();
    const [bytes, opts] = room.__publishData.mock.calls[0];
    expect(bytes && typeof (bytes as any).byteLength === 'number').toBe(true);
    expect(opts).toEqual({ reliable: true });
  });

  it('publishPartyEvent returns false when room is unknown', async () => {
    const ok = await publishPartyEvent('does-not-exist', {
    });
    expect(ok).toBe(false);
  });

  it('publishPartyEvent returns false when room is not connected', async () => {
    const room = makeFakeRoom();
    (room as any).state = 'disconnected';
    registerPartyEventsRoom('party-2', room as any);
    const ok = await publishPartyEvent('party-2', {
    });
    expect(ok).toBe(false);
  });
});
