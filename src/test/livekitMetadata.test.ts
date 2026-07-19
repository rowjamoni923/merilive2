/**
 * Pkg107: LiveKit Participant Metadata signaling tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerMetadataRoom,
  unregisterMetadataRoom,
  setLocalParticipantMetadata,
  readParticipantMetadata,
  __resetMetadataRegistryForTests,
} from '@/lib/livekitMetadata';

// Minimal fake Room/Participant matching the surface we use.
function makeFakeRoom(opts: {
  localIdentity?: string;
  localMetadata?: string;
  remotes?: { identity: string; metadata?: string }[];
} = {}) {
  const handlers: Record<string, Set<(...a: unknown[]) => void>> = {};
  const setMetadataSpy = vi.fn(async (json: string) => {
    room.localParticipant.metadata = json;
    handlers['participantMetadataChanged']?.forEach((h) =>
      h(undefined, room.localParticipant),
    );
  });
  const room: any = {
    state: 'connected',
    localParticipant: {
      identity: opts.localIdentity ?? 'local',
      metadata: opts.localMetadata,
      setMetadata: setMetadataSpy,
    },
    remoteParticipants: new Map(
      (opts.remotes ?? []).map((r) => [
        r.identity,
        { identity: r.identity, metadata: r.metadata },
      ]),
    ),
    on(event: string, cb: (...a: unknown[]) => void) {
      (handlers[event] ||= new Set()).add(cb);
      return this;
    },
    off(event: string, cb: (...a: unknown[]) => void) {
      handlers[event]?.delete(cb);
      return this;
    },
    __fire(event: string, ...args: unknown[]) {
      handlers[event]?.forEach((h) => h(...args));
    },
    __setMetadataSpy: setMetadataSpy,
  };
  return room;
}

describe('Pkg107 livekitMetadata', () => {
  beforeEach(() => {
    __resetMetadataRegistryForTests();
    vi.restoreAllMocks();
  });

  it('seeds events for existing participants on register', () => {
    const events: any[] = [];
    const handler = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('livekit-participant-metadata', handler);
    const room = makeFakeRoom({
      localIdentity: 'host',
      localMetadata: JSON.stringify({ afk: false }),
      remotes: [{ identity: 'viewer1', metadata: JSON.stringify({ tier: 'vip' }) }],
    });
    registerMetadataRoom('live', 'stream-1', room);
    window.removeEventListener('livekit-participant-metadata', handler);
    expect(events).toHaveLength(2);
    expect(events.find((e) => e.identity === 'host').metadata).toEqual({ afk: false });
    expect(events.find((e) => e.identity === 'viewer1').metadata).toEqual({ tier: 'vip' });
  });

  it('dispatches on ParticipantMetadataChanged', () => {
    const events: any[] = [];
    const handler = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('livekit-participant-metadata', handler);
    const room = makeFakeRoom();
    registerMetadataRoom('party', 'room-9', room);
    events.length = 0;
    const p = { identity: 'guest', metadata: JSON.stringify({ seat: 3 }) };
    room.__fire('participantMetadataChanged', undefined, p);
    window.removeEventListener('livekit-participant-metadata', handler);
    expect(events).toHaveLength(1);
    expect(events[0].scope).toBe('party');
    expect(events[0].id).toBe('room-9');
    expect(events[0].identity).toBe('guest');
    expect(events[0].metadata).toEqual({ seat: 3 });
  });

  it('safely returns null for unparsable metadata', () => {
    const room = makeFakeRoom({
    });
    registerMetadataRoom('call', 'c-1', room);
    expect(readParticipantMetadata('call', 'c-1', 'local')).toBeNull();
  });

  it('setLocalParticipantMetadata calls Room SDK', async () => {
    const room = makeFakeRoom();
    registerMetadataRoom('call', 'c-2', room);
    const ok = await setLocalParticipantMetadata('call', 'c-2', { afk: true });
    expect(ok).toBe(true);
    expect(room.__setMetadataSpy).toHaveBeenCalledWith(JSON.stringify({ afk: true }));
  });

  it('unregister stops dispatch', () => {
    const events: any[] = [];
    const handler = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('livekit-participant-metadata', handler);
    const room = makeFakeRoom();
    registerMetadataRoom('live', 's', room);
    events.length = 0;
    unregisterMetadataRoom('live', 's');
    room.__fire('participantMetadataChanged', undefined, { identity: 'x', metadata: '{}' });
    window.removeEventListener('livekit-participant-metadata', handler);
    expect(events).toHaveLength(0);
  });
});
