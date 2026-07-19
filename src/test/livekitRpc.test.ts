import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerRpcRoom,
  unregisterRpcRoom,
  registerRpcMethod,
  performRpc,
  _isRoomRegistered,
} from '@/lib/livekitRpc';

vi.mock('@/lib/livekitSignaling', () => ({
  isLiveKitEnabled: vi.fn(async () => true),
}));

function makeRoom() {
  const registered = new Map<string, any>();
  return {
    registered,
    registerRpcMethod: vi.fn((m: string, h: any) => registered.set(m, h)),
    unregisterRpcMethod: vi.fn((m: string) => registered.delete(m)),
    localParticipant: {
      performRpc: vi.fn(async ({ method, payload, destinationIdentity }: any) => {
        return `OK:${destinationIdentity}:${method}:${payload}`;
      }),
    },
  };
}

describe('Pkg120 LiveKit RPC', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers and unregisters a Room', () => {
    const room: any = makeRoom();
    registerRpcRoom('call', 'c1', room);
    expect(_isRoomRegistered('call', 'c1')).toBe(true);
    unregisterRpcRoom('call', 'c1');
    expect(_isRoomRegistered('call', 'c1')).toBe(false);
  });

  it('replacing the Room unregisters previous methods', () => {
    const a: any = makeRoom();
    const b: any = makeRoom();
    registerRpcRoom('live', 's1', a);
    registerRpcMethod('live', 's1', 'mute_me', async () => 'ok');
    expect(a.registered.has('mute_me')).toBe(true);
    registerRpcRoom('live', 's1', b);
    expect(a.unregisterRpcMethod).toHaveBeenCalledWith('mute_me');
  });

  it('registerRpcMethod attaches and returns dispose fn', () => {
    const room: any = makeRoom();
    registerRpcRoom('party', 'p1', room);
    const dispose = registerRpcMethod('party', 'p1', 'ping', async () => 'pong');
    expect(room.registerRpcMethod).toHaveBeenCalledWith('ping', expect.any(Function));
    dispose();
    expect(room.unregisterRpcMethod).toHaveBeenCalledWith('ping');
  });

  it('handler wraps user fn with kill-switch gate', async () => {
    const room: any = makeRoom();
    registerRpcRoom('call', 'c2', room);
    const userFn = vi.fn(async () => 'reply');
    registerRpcMethod('call', 'c2', 'echo', userFn);
    const wrapped = room.registered.get('echo');
    const result = await wrapped({ callerIdentity: 'u123', payload: 'hi', responseTimeout: 9000 });
    expect(result).toBe('reply');
    expect(userFn).toHaveBeenCalledWith(
      expect.objectContaining({ callerIdentity: 'u123', payload: 'hi', method: 'echo' }),
    );
  });

  it('handler rejects when kill-switch disabled', async () => {
    const sig = await import('@/lib/livekitSignaling');
    (sig.isLiveKitEnabled as any).mockResolvedValueOnce(false);
    const room: any = makeRoom();
    registerRpcRoom('call', 'c3', room);
    registerRpcMethod('call', 'c3', 'm', async () => 'x');
    const wrapped = room.registered.get('m');
    await expect(wrapped({ callerIdentity: 'u' })).rejects.toThrow('rpc_disabled');
  });

  it('performRpc forwards to localParticipant.performRpc', async () => {
    const room: any = makeRoom();
    registerRpcRoom('live', 's2', room);
    const out = await performRpc('live', 's2', {
      destinationIdentity: 'host42',
      method: 'kick',
      payload: '{"reason":"spam"}',
    });
    expect(out).toBe('OK:host42:kick:{"reason":"spam"}');
    expect(room.localParticipant.performRpc).toHaveBeenCalledWith({
      responseTimeout: 15000,
    });
  });

  it('performRpc throws when scope/id has no Room', async () => {
    await expect(
      performRpc('party', 'nope', { destinationIdentity: 'x', method: 'm' }),
    ).rejects.toThrow('room_not_registered');
  });

  it('performRpc throws when kill-switch disabled', async () => {
    const sig = await import('@/lib/livekitSignaling');
    (sig.isLiveKitEnabled as any).mockResolvedValueOnce(false);
    const room: any = makeRoom();
    registerRpcRoom('call', 'c9', room);
    await expect(
      performRpc('call', 'c9', { destinationIdentity: 'x', method: 'm' }),
    ).rejects.toThrow('rpc_disabled');
  });

  it('registerRpcMethod no-ops when Room not registered', () => {
    const dispose = registerRpcMethod('call', 'never', 'm', async () => 'x');
    expect(typeof dispose).toBe('function');
    dispose(); // safe to call
  });
});
