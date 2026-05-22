import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerRpcRoom,
  unregisterRpcRoom,
} from '@/lib/livekitRpc';
import {
  installStandardRpcMethods,
  requestMuteMe,
  announceKick,
  notifyApproveSeat,
  notifyDenySeat,
  ackRaisedHand,
  pingPeer,
} from '@/lib/livekitStandardRpc';

vi.mock('@/lib/livekitSignaling', () => ({
  isLiveKitEnabled: vi.fn(async () => true),
}));

function makeRoom() {
  const registered = new Map<string, (data: any) => Promise<string> | string>();
  return {
    registered,
    registerRpcMethod: vi.fn((m: string, h: any) => registered.set(m, h)),
    unregisterRpcMethod: vi.fn((m: string) => registered.delete(m)),
    localParticipant: {
      performRpc: vi.fn(async ({ method, payload, destinationIdentity }: any) => {
        // Echo into the same room's handler so caller→handler can be tested.
        const h = registered.get(method);
        if (!h) throw new Error('no_method');
        return await h({ callerIdentity: 'caller-x', payload, destinationIdentity, responseTimeout: 5000 });
      }),
    },
  };
}

describe('Pkg141 Standard RPC methods', () => {
  beforeEach(() => vi.clearAllMocks());

  it('installs all 6 standard methods', () => {
    const room: any = makeRoom();
    registerRpcRoom('live', 'std1', room);
    installStandardRpcMethods('live', 'std1', {});
    expect(room.registered.has('mute_me')).toBe(true);
    expect(room.registered.has('kick_request')).toBe(true);
    expect(room.registered.has('approve_seat')).toBe(true);
    expect(room.registered.has('deny_seat')).toBe(true);
    expect(room.registered.has('raise_hand_ack')).toBe(true);
    expect(room.registered.has('ping')).toBe(true);
    unregisterRpcRoom('live', 'std1');
  });

  it('mute_me returns ok when handler accepts', async () => {
    const room: any = makeRoom();
    registerRpcRoom('live', 'mm1', room);
    installStandardRpcMethods('live', 'mm1', { onMuteMe: () => true });
    const reply = await requestMuteMe('live', 'mm1', 'peer-1');
    expect(reply.ok).toBe(true);
    unregisterRpcRoom('live', 'mm1');
  });

  it('mute_me returns refused when handler rejects', async () => {
    const room: any = makeRoom();
    registerRpcRoom('live', 'mm2', room);
    installStandardRpcMethods('live', 'mm2', { onMuteMe: () => false });
    const reply = await requestMuteMe('live', 'mm2', 'peer-1');
    expect(reply.ok).toBe(false);
    expect(reply.reason).toBe('refused');
    unregisterRpcRoom('live', 'mm2');
  });

  it('mute_me without handler returns no_handler', async () => {
    const room: any = makeRoom();
    registerRpcRoom('live', 'mm3', room);
    installStandardRpcMethods('live', 'mm3', {});
    const reply = await requestMuteMe('live', 'mm3', 'peer-1');
    expect(reply.reason).toBe('no_handler');
    unregisterRpcRoom('live', 'mm3');
  });

  it('kick_request delivers reason payload', async () => {
    const room: any = makeRoom();
    registerRpcRoom('live', 'kr1', room);
    const onKick = vi.fn();
    installStandardRpcMethods('live', 'kr1', { onKickRequest: onKick });
    const reply = await announceKick('live', 'kr1', 'peer-1', 'spam');
    expect(reply.ok).toBe(true);
    expect(onKick).toHaveBeenCalledWith('caller-x', 'spam');
    unregisterRpcRoom('live', 'kr1');
  });

  it('approve_seat carries seatIndex back', async () => {
    const room: any = makeRoom();
    registerRpcRoom('party', 'ps1', room);
    const onApprove = vi.fn();
    installStandardRpcMethods('party', 'ps1', { onApproveSeat: onApprove });
    const reply = await notifyApproveSeat('party', 'ps1', 'peer-1', 3);
    expect(reply.ok).toBe(true);
    expect(reply.seatIndex).toBe(3);
    expect(onApprove).toHaveBeenCalledWith('caller-x', 3);
    unregisterRpcRoom('party', 'ps1');
  });

  it('deny_seat passes reason', async () => {
    const room: any = makeRoom();
    registerRpcRoom('party', 'ds1', room);
    const onDeny = vi.fn();
    installStandardRpcMethods('party', 'ds1', { onDenySeat: onDeny });
    const reply = await notifyDenySeat('party', 'ds1', 'peer-1', 'too_loud');
    expect(reply.ok).toBe(true);
    expect(onDeny).toHaveBeenCalledWith('caller-x', 'too_loud');
    unregisterRpcRoom('party', 'ds1');
  });

  it('raise_hand_ack fires host handler', async () => {
    const room: any = makeRoom();
    registerRpcRoom('live', 'rh1', room);
    const onAck = vi.fn();
    installStandardRpcMethods('live', 'rh1', { onRaiseHandAck: onAck });
    const reply = await ackRaisedHand('live', 'rh1', 'host-1');
    expect(reply.ok).toBe(true);
    expect(onAck).toHaveBeenCalledWith('caller-x');
    unregisterRpcRoom('live', 'rh1');
  });

  it('ping returns elapsed ms number', async () => {
    const room: any = makeRoom();
    registerRpcRoom('call', 'pg1', room);
    installStandardRpcMethods('call', 'pg1', {});
    const ms = await pingPeer('call', 'pg1', 'peer-1');
    expect(typeof ms).toBe('number');
    expect(ms).toBeGreaterThanOrEqual(0);
    unregisterRpcRoom('call', 'pg1');
  });

  it('warns and returns no-op when Room not registered', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dispose = installStandardRpcMethods('live', 'unknown-room', {});
    expect(warn).toHaveBeenCalled();
    expect(typeof dispose).toBe('function');
    dispose();
    warn.mockRestore();
  });
});
