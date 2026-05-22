/**
 * Pkg72 unit tests — envelope + dedupe + kill-switch defaults.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildEnvelope,
  encodeEnvelope,
  decodeEnvelope,
  isDuplicateEnvelope,
  __test,
} from '@/lib/livekitSignaling';

describe('Pkg72 livekitSignaling foundation', () => {
  it('builds envelope with required fields', () => {
    const env = buildEnvelope('gift', 'send', { giftId: 'g1', qty: 1 }, 'user-x');
    expect(env.v).toBe(1);
    expect(env.f).toBe('gift');
    expect(env.t).toBe('send');
    expect(env.s).toBe('user-x');
    expect(env.id).toMatch(/^[a-z0-9-]+$/);
    expect(env.ts).toBeGreaterThan(0);
    expect(env.p).toEqual({ giftId: 'g1', qty: 1 });
  });

  it('encode → decode round-trips and preserves shape', () => {
    const env = buildEnvelope('chat', 'msg', { text: 'hi' });
    const bytes = encodeEnvelope(env);
    const back = decodeEnvelope(bytes);
    expect(back).toEqual(env);
  });

  it('decodeEnvelope rejects garbage and wrong version', () => {
    expect(decodeEnvelope(new TextEncoder().encode('not json'))).toBeNull();
    expect(
      decodeEnvelope(new TextEncoder().encode(JSON.stringify({ v: 2, f: 'x' }))),
    ).toBeNull();
  });

  it('isDuplicateEnvelope blocks repeats within window, allows new ids', () => {
    const id = `dedupe-${Date.now()}-${Math.random()}`;
    expect(isDuplicateEnvelope(id)).toBe(false);
    expect(isDuplicateEnvelope(id)).toBe(true);
    expect(isDuplicateEnvelope(id + '-other')).toBe(false);
  });

  it('default flags include 8 core features ON and opt-in features OFF', () => {
    const flags = __test.DEFAULT_FLAGS;
    for (const k of ['call', 'chat', 'game', 'gift', 'live', 'party', 'pk', 'presence']) {
      expect(flags[k as keyof typeof flags]).toBe(true);
    }
    for (const k of ['e2ee', 'ingress', 'sip', 'egress', 'track_egress', 'stream_egress', 'sip_inbound', 'transcription', 'agent']) {
      expect(flags[k as keyof typeof flags]).toBe(false);
    }
  });

});
