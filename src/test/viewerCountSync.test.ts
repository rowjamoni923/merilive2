import { describe, it, expect } from 'vitest';
import {
  createViewerState,
  applyViewerEvent,
  applyAuthoritativeCount,
  resetViewers,
} from '@/lib/viewerCountReducer';

const S = 'stream-1';
const S2 = 'stream-2';

const seed = () =>
  createViewerState([
    { id: S, viewer_count: 0 },
    { id: S2, viewer_count: 5 },
  ]);

const count = (s: ReturnType<typeof seed>, id: string) =>
  s.streams.find((x) => x.id === id)!.viewer_count;

describe('viewer count sync (join/leave regression guard)', () => {
  it('increments on viewer JOIN (INSERT)', () => {
    let s = seed();
    s = applyViewerEvent(s, { eventType: 'INSERT', streamId: S, viewerId: 'u1' });
    expect(count(s, S)).toBe(1);
  });

  it('decrements on viewer LEAVE (DELETE)', () => {
    let s = seed();
    s = applyViewerEvent(s, { eventType: 'INSERT', streamId: S, viewerId: 'u1' });
    s = applyViewerEvent(s, { eventType: 'INSERT', streamId: S, viewerId: 'u2' });
    s = applyViewerEvent(s, { eventType: 'DELETE', streamId: S, viewerId: 'u1' });
    expect(count(s, S)).toBe(1);
  });

  it('treats UPDATE with left_at as a leave', () => {
    let s = seed();
    s = applyViewerEvent(s, { eventType: 'INSERT', streamId: S, viewerId: 'u1' });
    s = applyViewerEvent(s, {
      eventType: 'UPDATE',
      streamId: S,
      viewerId: 'u1',
      leftAt: new Date().toISOString(),
    });
    expect(count(s, S)).toBe(0);
  });

  it('treats UPDATE with null left_at as a join (presence re-assert)', () => {
    let s = seed();
    s = applyViewerEvent(s, {
    });
    expect(count(s, S)).toBe(1);
  });

  it('is idempotent against duplicate INSERTs for the same viewer', () => {
    let s = seed();
    s = applyViewerEvent(s, { eventType: 'INSERT', streamId: S, viewerId: 'u1' });
    s = applyViewerEvent(s, { eventType: 'INSERT', streamId: S, viewerId: 'u1' });
    s = applyViewerEvent(s, { eventType: 'INSERT', streamId: S, viewerId: 'u1' });
    expect(count(s, S)).toBe(1);
  });

  it('ignores DELETE for a viewer we never tracked', () => {
    let s = seed();
    s = applyViewerEvent(s, { eventType: 'DELETE', streamId: S, viewerId: 'ghost' });
    expect(count(s, S)).toBe(0);
  });

  it('never drops viewer_count below zero', () => {
    let s = seed(); // S starts at 0
    s = applyViewerEvent(s, { eventType: 'DELETE', streamId: S, viewerId: 'u1' });
    s = applyViewerEvent(s, { eventType: 'DELETE', streamId: S, viewerId: 'u2' });
    expect(count(s, S)).toBe(0);
  });

  it('isolates counts between streams', () => {
    let s = seed();
    s = applyViewerEvent(s, { eventType: 'INSERT', streamId: S, viewerId: 'u1' });
    s = applyViewerEvent(s, { eventType: 'INSERT', streamId: S2, viewerId: 'u1' });
    expect(count(s, S)).toBe(1);
    expect(count(s, S2)).toBe(6);
  });

  it('server-authoritative live_streams UPDATE overrides drift', () => {
    let s = seed();
    // simulate local drift
    s = applyViewerEvent(s, { eventType: 'INSERT', streamId: S, viewerId: 'u1' });
    s = applyViewerEvent(s, { eventType: 'INSERT', streamId: S, viewerId: 'u2' });
    expect(count(s, S)).toBe(2);
    // server says actually 7
    s = applyAuthoritativeCount(s, S, 7);
    expect(count(s, S)).toBe(7);
  });

  it('reconnect resync clears tracker so post-reconnect joins start from server truth', () => {
    let s = seed();
    s = applyViewerEvent(s, { eventType: 'INSERT', streamId: S, viewerId: 'u1' });
    s = applyViewerEvent(s, { eventType: 'INSERT', streamId: S, viewerId: 'u2' });

    // Disconnect → server truth fetched (10) → tracker reset
    s = applyAuthoritativeCount(s, S, 10);
    s = resetViewers(s);
    expect(count(s, S)).toBe(10);

    // Same viewer u1 re-joins after reconnect — must count as +1, not no-op
    s = applyViewerEvent(s, { eventType: 'INSERT', streamId: S, viewerId: 'u1' });
    expect(count(s, S)).toBe(11);
  });

  it('rapid join → leave → join settles to active=1', () => {
    let s = seed();
    s = applyViewerEvent(s, { eventType: 'INSERT', streamId: S, viewerId: 'u1' });
    s = applyViewerEvent(s, { eventType: 'DELETE', streamId: S, viewerId: 'u1' });
    s = applyViewerEvent(s, { eventType: 'INSERT', streamId: S, viewerId: 'u1' });
    expect(count(s, S)).toBe(1);
  });

  it('ignores events for unknown stream ids', () => {
    let s = seed();
    s = applyViewerEvent(s, { eventType: 'INSERT', streamId: 'nope', viewerId: 'u1' });
    expect(count(s, S)).toBe(0);
    expect(count(s, S2)).toBe(5);
  });
});
