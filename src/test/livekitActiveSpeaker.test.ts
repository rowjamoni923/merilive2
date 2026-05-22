/**
 * Pkg98: Active Speaker detection tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RoomEvent } from 'livekit-client';
import {
  registerActiveSpeakerRoom,
  unregisterActiveSpeakerRoom,
  getActiveSpeakers,
  __resetActiveSpeakerRegistryForTests,
  type ActiveSpeakersDetail,
} from '@/lib/livekitActiveSpeaker';

vi.mock('@/lib/livekitSignaling', () => ({
  isLiveKitEnabled: vi.fn().mockResolvedValue(true),
}));

function makeMockRoom() {
  const listeners = new Map<string, Set<Function>>();
  return {
    activeSpeakers: [] as any[],
    on(evt: string, cb: Function) {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt)!.add(cb);
      return this;
    },
    off(evt: string, cb: Function) {
      listeners.get(evt)?.delete(cb);
      return this;
    },
    emit(evt: string, ...args: any[]) {
      listeners.get(evt)?.forEach((cb) => cb(...args));
    },
  };
}

describe('Pkg98 livekitActiveSpeaker', () => {
  beforeEach(() => __resetActiveSpeakerRegistryForTests());
  afterEach(() => __resetActiveSpeakerRegistryForTests());

  it('dispatches window event on ActiveSpeakersChanged', () => {
    const room = makeMockRoom();
    const events: ActiveSpeakersDetail[] = [];
    const handler = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('livekit-active-speakers', handler);

    registerActiveSpeakerRoom('party', 'room-1', room as any);

    room.emit(RoomEvent.ActiveSpeakersChanged, [
      { identity: 'user-a', audioLevel: 0.7 },
      { identity: 'user-b', audioLevel: 0.4 },
    ]);

    window.removeEventListener('livekit-active-speakers', handler);
    const last = events[events.length - 1];
    expect(last.scope).toBe('party');
    expect(last.id).toBe('room-1');
    expect(last.identities).toEqual(['user-a', 'user-b']);
    expect(last.levels['user-a']).toBeCloseTo(0.7);
  });

  it('clears speakers on unregister', () => {
    const room = makeMockRoom();
    const events: ActiveSpeakersDetail[] = [];
    const handler = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('livekit-active-speakers', handler);

    registerActiveSpeakerRoom('call', 'call-9', room as any);
    room.emit(RoomEvent.ActiveSpeakersChanged, [{ identity: 'x', audioLevel: 0.5 }]);
    unregisterActiveSpeakerRoom('call', 'call-9');

    window.removeEventListener('livekit-active-speakers', handler);
    const last = events[events.length - 1];
    expect(last.identities).toEqual([]);
  });

  it('scopes are independent', () => {
    const r1 = makeMockRoom();
    const r2 = makeMockRoom();
    registerActiveSpeakerRoom('live', 'stream-1', r1 as any);
    registerActiveSpeakerRoom('party', 'stream-1', r2 as any);

    const events: ActiveSpeakersDetail[] = [];
    const handler = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('livekit-active-speakers', handler);

    r1.emit(RoomEvent.ActiveSpeakersChanged, [{ identity: 'live-host' }]);
    r2.emit(RoomEvent.ActiveSpeakersChanged, [{ identity: 'party-host' }]);

    window.removeEventListener('livekit-active-speakers', handler);
    const liveEvent = events.find((e) => e.scope === 'live' && e.identities[0] === 'live-host');
    const partyEvent = events.find((e) => e.scope === 'party' && e.identities[0] === 'party-host');
    expect(liveEvent).toBeTruthy();
    expect(partyEvent).toBeTruthy();
  });

  it('getActiveSpeakers reads room.activeSpeakers', () => {
    const room = makeMockRoom();
    room.activeSpeakers = [{ identity: 'a' }, { identity: 'b' }];
    registerActiveSpeakerRoom('live', 's1', room as any);
    expect(getActiveSpeakers('live', 's1')).toEqual(['a', 'b']);
    expect(getActiveSpeakers('live', 'unknown')).toEqual([]);
  });
});
