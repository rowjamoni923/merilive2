/**
 * Pkg73: Private-call signaling — unit tests.
 *
 * Verifies the LiveKit DataPacket layer:
 *  - registerCallRoom binds DataReceived listener
 *  - incoming 'call_ended' envelope → window CustomEvent
 *  - publishCallEnded routes through Pkg72 envelope helpers
 *  - unregisterCallRoom detaches cleanly
 *  - dedupe drops a repeated envelope id within the 400ms window
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerCallRoom,
  unregisterCallRoom,
  publishCallEnded,
  __resetCallSignalingRegistryForTests,
  type CallEndedDetail,
} from '@/lib/livekitCallSignaling';
import {
  buildEnvelope,
  encodeEnvelope,
  invalidateLiveKitFlags,
} from '@/lib/livekitSignaling';

// ── Minimal LiveKit Room mock ─────────────────────────────────────────────
function makeMockRoom(opts?: { state?: string }) {
  const listeners = new Map<string, Set<Function>>();
  const published: { bytes: Uint8Array; reliable?: boolean }[] = [];
  return {
    state: opts?.state ?? 'connected',
    localParticipant: {
      identity: 'sender-uid',
      publishData: vi.fn(async (bytes: Uint8Array, p?: any) => {
        published.push({ bytes, reliable: p?.reliable });
      }),
    },
    on(event: string, cb: Function) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    },
    off(event: string, cb: Function) {
      listeners.get(event)?.delete(cb);
    },
    emitDataReceived(bytes: Uint8Array, participant?: any) {
      listeners.get('dataReceived')?.forEach((fn) => fn(bytes, participant));
    },
    listenerCount(event: string) {
      return listeners.get(event)?.size ?? 0;
    },
    __published: published,
  };
}

// ── Force kill-switch ON without hitting Supabase ─────────────────────────
beforeEach(() => {
  __resetCallSignalingRegistryForTests();
  invalidateLiveKitFlags();
  // Seed cache to "all features ON" so publishCallEnded skips the network.
  // The Pkg72 module exposes default flags via __test; we instead just call
  // the public getter once and immediately resolve true via a stub.
  // Easiest path: stub the supabase client used by livekitSignaling.
  vi.doMock('@/integrations/supabase/client', () => ({
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { setting_value: JSON.stringify({ call: true }) },
            }),
          }),
        }),
      }),
    },
  }));
});

describe('Pkg73 livekitCallSignaling', () => {
  it('registerCallRoom binds a DataReceived listener', () => {
    const room = makeMockRoom();
    expect(room.listenerCount('dataReceived')).toBe(0);
    registerCallRoom('call-1', room as any);
    expect(room.listenerCount('dataReceived')).toBe(1);
  });

  it('forwards call_ended envelope to window event', () => {
    const room = makeMockRoom();
    registerCallRoom('call-1', room as any);

    const received: CallEndedDetail[] = [];
    const listener = (e: Event) =>
      received.push((e as CustomEvent<CallEndedDetail>).detail);
    window.addEventListener('livekit-call-ended', listener);

    const env = buildEnvelope(
      'call',
      'call_ended',
      { callId: 'call-1', endedBy: 'peer-uid', reason: 'host_hangup', duration: 42 },
      'peer-uid',
    );
    room.emitDataReceived(encodeEnvelope(env), { identity: 'peer-uid' });

    window.removeEventListener('livekit-call-ended', listener);

    expect(received.length).toBe(1);
    expect(received[0]).toMatchObject({
      callId: 'call-1',
      endedBy: 'peer-uid',
      reason: 'host_hangup',
      duration: 42,
    });
  });

  it('ignores packets for a different callId', () => {
    const room = makeMockRoom();
    registerCallRoom('call-1', room as any);

    const received: CallEndedDetail[] = [];
    const listener = (e: Event) =>
      received.push((e as CustomEvent<CallEndedDetail>).detail);
    window.addEventListener('livekit-call-ended', listener);

    const env = buildEnvelope('call', 'call_ended', {
      callId: 'OTHER-CALL',
      endedBy: 'x',
    });
    room.emitDataReceived(encodeEnvelope(env));

    window.removeEventListener('livekit-call-ended', listener);
    expect(received.length).toBe(0);
  });

  it('ignores non-call_ended envelopes', () => {
    const room = makeMockRoom();
    registerCallRoom('call-1', room as any);
    const received: any[] = [];
    const listener = (e: Event) => received.push(e);
    window.addEventListener('livekit-call-ended', listener);

    const env = buildEnvelope('call', 'mute', { callId: 'call-1' });
    room.emitDataReceived(encodeEnvelope(env));

    window.removeEventListener('livekit-call-ended', listener);
    expect(received.length).toBe(0);
  });

  it('dedupes duplicate envelope ids within the 400ms window', () => {
    const room = makeMockRoom();
    registerCallRoom('call-1', room as any);
    const received: any[] = [];
    const listener = (e: Event) => received.push(e);
    window.addEventListener('livekit-call-ended', listener);

    const env = buildEnvelope('call', 'call_ended', {
      callId: 'call-1',
      endedBy: 'peer',
    });
    const bytes = encodeEnvelope(env);
    room.emitDataReceived(bytes);
    room.emitDataReceived(bytes);

    window.removeEventListener('livekit-call-ended', listener);
    expect(received.length).toBe(1);
  });

  it('unregisterCallRoom removes the listener', () => {
    const room = makeMockRoom();
    registerCallRoom('call-1', room as any);
    expect(room.listenerCount('dataReceived')).toBe(1);
    unregisterCallRoom('call-1');
    expect(room.listenerCount('dataReceived')).toBe(0);
  });

  it('publishCallEnded sends an encoded envelope on the bound room', async () => {
    const room = makeMockRoom();
    registerCallRoom('call-1', room as any);

    const ok = await publishCallEnded('call-1', {
      endedBy: 'me',
      reason: 'caller_hangup',
      duration: 10,
    });

    expect(ok).toBe(true);
    expect(room.__published.length).toBe(1);
    expect(room.__published[0].reliable).toBe(true);
  });

  it('publishCallEnded returns false when room is unknown', async () => {
    const ok = await publishCallEnded('does-not-exist', { endedBy: 'me' });
    expect(ok).toBe(false);
  });

  it('publishCallEnded returns false when room is not connected', async () => {
    const room = makeMockRoom({ state: 'connecting' });
    registerCallRoom('call-2', room as any);
    const ok = await publishCallEnded('call-2', { endedBy: 'me' });
    expect(ok).toBe(false);
    expect(room.__published.length).toBe(0);
  });
});
