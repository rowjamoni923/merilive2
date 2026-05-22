/**
 * Pkg101: Connection Quality detection tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RoomEvent, ConnectionQuality } from 'livekit-client';
import {
  registerConnectionQualityRoom,
  unregisterConnectionQualityRoom,
  getConnectionQuality,
  __resetConnectionQualityRegistryForTests,
  type ConnectionQualityDetail,
} from '@/lib/livekitConnectionQuality';

vi.mock('@/lib/livekitSignaling', () => ({
  isLiveKitEnabled: vi.fn().mockResolvedValue(true),
}));

function makeMockRoom(localIdentity = 'me') {
  const listeners = new Map<string, Set<Function>>();
  return {
    localParticipant: { identity: localIdentity, connectionQuality: ConnectionQuality.Unknown },
    remoteParticipants: new Map(),
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

describe('Pkg101 livekitConnectionQuality', () => {
  beforeEach(() => __resetConnectionQualityRegistryForTests());
  afterEach(() => __resetConnectionQualityRegistryForTests());

  it('dispatches local quality change', () => {
    const room = makeMockRoom('me');
    const events: ConnectionQualityDetail[] = [];
    const handler = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('livekit-connection-quality', handler);

    registerConnectionQualityRoom('call', 'c1', room as any);
    room.emit(RoomEvent.ConnectionQualityChanged, ConnectionQuality.Poor, { identity: 'me' });

    window.removeEventListener('livekit-connection-quality', handler);
    const last = events[events.length - 1];
    expect(last.scope).toBe('call');
    expect(last.id).toBe('c1');
    expect(last.local).toBe('poor');
  });

  it('tracks remote participant quality separately', () => {
    const room = makeMockRoom('me');
    const events: ConnectionQualityDetail[] = [];
    const handler = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('livekit-connection-quality', handler);

    registerConnectionQualityRoom('party', 'p1', room as any);
    room.emit(RoomEvent.ConnectionQualityChanged, ConnectionQuality.Excellent, { identity: 'peer' });
    room.emit(RoomEvent.ConnectionQualityChanged, ConnectionQuality.Lost, { identity: 'peer' });

    window.removeEventListener('livekit-connection-quality', handler);
    const last = events[events.length - 1];
    expect(last.remotes['peer']).toBe('lost');
    expect(last.local).toBe('unknown');
  });

  it('getConnectionQuality returns current snapshot', () => {
    const room = makeMockRoom('me');
    registerConnectionQualityRoom('live', 's1', room as any);
    room.emit(RoomEvent.ConnectionQualityChanged, ConnectionQuality.Good, { identity: 'me' });
    room.emit(RoomEvent.ConnectionQualityChanged, ConnectionQuality.Poor, { identity: 'viewer' });
    const snap = getConnectionQuality('live', 's1');
    expect(snap.local).toBe('good');
    expect(snap.remotes['viewer']).toBe('poor');
    expect(getConnectionQuality('live', 'nope')).toEqual({ local: 'unknown', remotes: {} });
  });

  it('unregister stops dispatching', () => {
    const room = makeMockRoom('me');
    const events: ConnectionQualityDetail[] = [];
    const handler = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('livekit-connection-quality', handler);

    registerConnectionQualityRoom('call', 'c2', room as any);
    unregisterConnectionQualityRoom('call', 'c2');
    const before = events.length;
    room.emit(RoomEvent.ConnectionQualityChanged, ConnectionQuality.Poor, { identity: 'me' });

    window.removeEventListener('livekit-connection-quality', handler);
    expect(events.length).toBe(before);
  });
});
