import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerTrackPermissionRoom,
  setHostBlocklist,
  addToHostBlocklist,
  removeFromHostBlocklist,
  unregister,
  __test,
} from '@/lib/livekitTrackPermissions';

function makeFakeRoom() {
  const handlers: Record<string, Function[]> = {};
  const calls: Array<[boolean, any[]]> = [];
  const room: any = {
    on: (ev: string, h: Function) => { (handlers[ev] ||= []).push(h); },
    off: (ev: string, h: Function) => {
      handlers[ev] = (handlers[ev] || []).filter((x) => x !== h);
    },
    emit: (ev: string) => (handlers[ev] || []).forEach((h) => h()),
    localParticipant: {
      setTrackSubscriptionPermissions: (allAllowed: boolean, perms: any[]) => {
        calls.push([allAllowed, perms]);
      },
    },
  };
  return { room, calls, handlers };
}

describe('Pkg105 livekitTrackPermissions', () => {
  beforeEach(() => {
    __test.registry.clear();
  });

  it('registers room and applies empty blocklist immediately', () => {
    const { room, calls } = makeFakeRoom();
    registerTrackPermissionRoom('live', 'stream-1', room as any);
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe(true);
    expect(calls[0][1]).toEqual([]);
  });

  it('setHostBlocklist before register stashes; applies on register', () => {
    setHostBlocklist('live', 'stream-2', new Set(['userA', 'userB']));
    const { room, calls } = makeFakeRoom();
    registerTrackPermissionRoom('live', 'stream-2', room as any);
    expect(calls.length).toBe(1);
    expect(calls[0][1].map((p: any) => p.participantIdentity).sort()).toEqual(['userA', 'userB']);
    expect(calls[0][1].every((p: any) => p.allowAll === false)).toBe(true);
  });

  it('re-applies permissions when ParticipantConnected fires', () => {
    const { room, calls } = makeFakeRoom();
    registerTrackPermissionRoom('live', 'stream-3', room as any);
    setHostBlocklist('live', 'stream-3', new Set(['evilUser']));
    expect(calls.length).toBe(2); // initial empty + setHostBlocklist
    room.emit('participantConnected');
    expect(calls.length).toBe(3);
    expect(calls[3][1][0].participantIdentity).toBe('evilUser');
  });

  it('add/remove update the SFU call', () => {
    const { room, calls } = makeFakeRoom();
    registerTrackPermissionRoom('live', 'stream-4', room as any);
    addToHostBlocklist('live', 'stream-4', 'x');
    addToHostBlocklist('live', 'stream-4', 'y');
    removeFromHostBlocklist('live', 'stream-4', 'x');
    const last = calls[calls.length - 1][1].map((p: any) => p.participantIdentity);
    expect(last).toEqual(['y']);
  });

  it('unregister stops re-applying on ParticipantConnected', () => {
    const { room, calls } = makeFakeRoom();
    registerTrackPermissionRoom('live', 'stream-5', room as any);
    const before = calls.length;
    unregister('live', 'stream-5');
    room.emit('participantConnected');
    expect(calls.length).toBe(before);
  });

  it('isolates scopes (live vs call vs party with same id)', () => {
    const a = makeFakeRoom();
    const b = makeFakeRoom();
    registerTrackPermissionRoom('live', 'X', a.room as any);
    registerTrackPermissionRoom('call', 'X', b.room as any);
    setHostBlocklist('live', 'X', new Set(['u1']));
    expect(a.calls[a.calls.length - 1][1].length).toBe(1);
    expect(b.calls[b.calls.length - 1][1].length).toBe(0);
  });
});
