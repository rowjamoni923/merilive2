import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoomEvent } from 'livekit-client';
import {
  registerLiveFilterRoom,
  unregisterLiveFilterRoom,
  publishLiveFilterUpdate,
  __resetLiveFilterRegistryForTests,
} from '@/lib/livekitLiveFilterSignaling';
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
            data: { setting_value: JSON.stringify({ live: true }) },
            error: null,
          }),
        }),
      }),
    }),
  },
}));

describe('livekitLiveFilterSignaling', () => {
  beforeEach(() => {
    __resetLiveFilterRegistryForTests();
  });

  it('binds and unbinds DataReceived for a stream', () => {
    const room = makeFakeRoom();
    registerLiveFilterRoom('stream-1', room as any);
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(1);
    unregisterLiveFilterRoom('stream-1');
    expect(room.__listenerCount(RoomEvent.DataReceived)).toBe(0);
  });

  it('dispatches livekit-live-filter for matching filter_update packets', () => {
    const room = makeFakeRoom();
    registerLiveFilterRoom('stream-1', room as any);
    const listener = vi.fn();
    window.addEventListener('livekit-live-filter', listener);

    const env = buildEnvelope('live', 'filter_update', {
      streamId: 'stream-1',
      state: { beautyEnabled: false },
      timestamp: Date.now(),
    }, 'host-1');
    room.__emit(RoomEvent.DataReceived, encodeEnvelope(env), { identity: 'host-1' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail.payload.state.beautyEnabled).toBe(false);
    window.removeEventListener('livekit-live-filter', listener);
  });

  it('publishes filter_update via LiveKit DataPacket', async () => {
    const room = makeFakeRoom();
    registerLiveFilterRoom('stream-1', room as any);
    const ok = await publishLiveFilterUpdate('stream-1', { beautyEnabled: true });
    expect(ok).toBe(true);
    expect(room.__publishData).toHaveBeenCalledTimes(1);
  });
});