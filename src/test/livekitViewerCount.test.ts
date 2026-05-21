/**
 * Pkg77 unit tests — viewer count via LiveKit participant events.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoomEvent } from 'livekit-client';
import {
  registerViewerCountRoom,
  unregisterViewerCountRoom,
  getLiveKitViewerCount,
  __resetViewerCountRegistryForTests,
  type ViewerCountDetail,
} from '../lib/livekitViewerCount';

function makeFakeRoom(initialCount = 0) {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const remoteParticipants = new Map<string, unknown>();
  for (let i = 0; i < initialCount; i++) remoteParticipants.set(`u${i}`, {});

  const room = {
    state: 'connected' as const,
    remoteParticipants,
    on(evt: string, cb: (...args: unknown[]) => void) {
      (handlers[evt] = handlers[evt] || []).push(cb);
      return room;
    },
    off(evt: string, cb: (...args: unknown[]) => void) {
      handlers[evt] = (handlers[evt] || []).filter((h) => h !== cb);
      return room;
    },
    emit(evt: string, ...args: unknown[]) {
      (handlers[evt] || []).forEach((h) => h(...args));
    },
  };
  return room;
}

describe('Pkg77 livekitViewerCount', () => {
  beforeEach(() => {
    __resetViewerCountRegistryForTests();
  });

  it('emits initial snapshot on register', () => {
    const room = makeFakeRoom(3);
    const events: ViewerCountDetail[] = [];
    const listener = (e: Event) =>
      events.push((e as CustomEvent<ViewerCountDetail>).detail);
    window.addEventListener('livekit-viewer-count', listener);

    registerViewerCountRoom('stream-1', room as never);

    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1]).toEqual({ streamId: 'stream-1', count: 3 });
    window.removeEventListener('livekit-viewer-count', listener);
  });

  it('emits on ParticipantConnected (count goes up)', () => {
    const room = makeFakeRoom(1);
    registerViewerCountRoom('s', room as never);
    const spy = vi.fn();
    window.addEventListener('livekit-viewer-count', spy as EventListener);
    room.remoteParticipants.set('new', {});
    room.emit(RoomEvent.ParticipantConnected, {});
    expect(spy).toHaveBeenCalled();
    const detail = (spy.mock.calls[0][0] as CustomEvent<ViewerCountDetail>).detail;
    expect(detail).toEqual({ streamId: 's', count: 2 });
    window.removeEventListener('livekit-viewer-count', spy as EventListener);
  });

  it('emits on ParticipantDisconnected (count goes down)', () => {
    const room = makeFakeRoom(2);
    registerViewerCountRoom('s', room as never);
    const spy = vi.fn();
    window.addEventListener('livekit-viewer-count', spy as EventListener);
    room.remoteParticipants.delete('u0');
    room.emit(RoomEvent.ParticipantDisconnected, {});
    const detail = (spy.mock.calls[0][0] as CustomEvent<ViewerCountDetail>).detail;
    expect(detail.count).toBe(1);
    window.removeEventListener('livekit-viewer-count', spy as EventListener);
  });

  it('getLiveKitViewerCount returns current size', () => {
    const room = makeFakeRoom(5);
    registerViewerCountRoom('s', room as never);
    expect(getLiveKitViewerCount('s')).toBe(5);
    expect(getLiveKitViewerCount('other')).toBe(0);
    expect(getLiveKitViewerCount(null)).toBe(0);
  });

  it('unregister stops further emissions', () => {
    const room = makeFakeRoom(1);
    registerViewerCountRoom('s', room as never);
    unregisterViewerCountRoom('s');
    const spy = vi.fn();
    window.addEventListener('livekit-viewer-count', spy as EventListener);
    room.remoteParticipants.set('x', {});
    room.emit(RoomEvent.ParticipantConnected, {});
    expect(spy).not.toHaveBeenCalled();
    window.removeEventListener('livekit-viewer-count', spy as EventListener);
  });

  it('register twice is idempotent (cleans previous listeners)', () => {
    const room = makeFakeRoom(0);
    registerViewerCountRoom('s', room as never);
    registerViewerCountRoom('s', room as never);
    const spy = vi.fn();
    window.addEventListener('livekit-viewer-count', spy as EventListener);
    room.remoteParticipants.set('x', {});
    room.emit(RoomEvent.ParticipantConnected, {});
    // single emission (one set of listeners), not duplicated
    expect(spy).toHaveBeenCalledTimes(1);
    window.removeEventListener('livekit-viewer-count', spy as EventListener);
  });

  it('safe with missing args', () => {
    expect(() => registerViewerCountRoom(null, null)).not.toThrow();
    expect(() => unregisterViewerCountRoom(null)).not.toThrow();
    expect(getLiveKitViewerCount(undefined)).toBe(0);
  });
});
