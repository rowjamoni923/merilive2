// Pkg115 unit tests — payload validation + identity helper.
import { describe, it, expect } from 'vitest';
import { isSipInboundIdentity } from '@/lib/livekitSipInbound';

describe('Pkg115 isSipInboundIdentity', () => {
  it('detects default sip_ prefix', () => {
    expect(isSipInboundIdentity('sip_abc123')).toBe(true);
    expect(isSipInboundIdentity('sip_+15551234567')).toBe(true);
  });
  it('rejects regular user identity', () => {
    expect(isSipInboundIdentity('user_uuid')).toBe(false);
    expect(isSipInboundIdentity('host_xyz')).toBe(false);
  });
  it('respects custom prefix', () => {
    expect(isSipInboundIdentity('pstn_555', 'pstn_')).toBe(true);
    expect(isSipInboundIdentity('sip_555', 'pstn_')).toBe(false);
  });
  it('handles null/undefined/empty', () => {
    expect(isSipInboundIdentity(null)).toBe(false);
    expect(isSipInboundIdentity(undefined)).toBe(false);
    expect(isSipInboundIdentity('')).toBe(false);
  });
});

// Mirror the rule shape the edge function builds from form input.
function buildDispatchRule(input: {
  ruleType?: 'direct' | 'individual';
  roomName?: string;
  roomPrefix?: string;
}) {
  const finalRuleType = input.ruleType ?? (input.roomName ? 'direct' : 'individual');
  if (finalRuleType === 'direct' && !input.roomName) return { error: 'roomName_required_for_direct' };
  if (finalRuleType === 'individual' && !input.roomPrefix) return { error: 'roomPrefix_required_for_individual' };
  return finalRuleType === 'direct'
    ? { type: 'direct', roomName: input.roomName! }
    : { type: 'individual', roomPrefix: input.roomPrefix! };
}

describe('Pkg115 buildDispatchRule', () => {
  it('infers direct from roomName', () => {
    expect(buildDispatchRule({ roomName: 'live_1' })).toEqual({ type: 'direct', roomName: 'live_1' });
  });
  it('infers individual from roomPrefix', () => {
    expect(buildDispatchRule({ roomPrefix: 'sip_room_' })).toEqual({ type: 'individual', roomPrefix: 'sip_room_' });
  });
  it('rejects direct without roomName', () => {
    expect(buildDispatchRule({ ruleType: 'direct' })).toEqual({ error: 'roomName_required_for_direct' });
  });
  it('rejects individual without roomPrefix', () => {
    expect(buildDispatchRule({ ruleType: 'individual' })).toEqual({ error: 'roomPrefix_required_for_individual' });
  });
  it('explicit ruleType wins', () => {
    expect(buildDispatchRule({ ruleType: 'individual', roomPrefix: 'p_', roomName: 'live_x' }))
      .toEqual({ type: 'individual', roomPrefix: 'p_' });
  });
});
