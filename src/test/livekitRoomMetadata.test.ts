import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerRoomMetadataRoom,
  unregisterRoomMetadataRoom,
  readRoomMetadata,
  setRoomMetadata,
  _isRoomMetadataRegistered,
} from '@/lib/livekitRoomMetadata';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async (_name: string, _opts: any) => ({ data: { ok: true }, error: null })),
    },
  },
}));

function makeRoom(initialMd = '') {
  const handlers = new Map<string, Function>();
  return {
    metadata: initialMd,
    on: vi.fn((ev: string, h: Function) => {
      handlers.set(ev, h);
    }),
    off: vi.fn((ev: string, h: Function) => {
      if (handlers.get(ev) === h) handlers.delete(ev);
    }),
    _emit(ev: string, ...args: any[]) {
      handlers.get(ev)?.(...args);
    },
  };
}

describe('Pkg122 LiveKit Room Metadata', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registers + unregisters a Room', () => {
    const r: any = makeRoom();
    registerRoomMetadataRoom('live', 's1', r);
    expect(_isRoomMetadataRegistered('live', 's1')).toBe(true);
    expect(r.on).toHaveBeenCalledWith('roomMetadataChanged', expect.any(Function));
    unregisterRoomMetadataRoom('live', 's1');
    expect(_isRoomMetadataRegistered('live', 's1')).toBe(false);
    expect(r.off).toHaveBeenCalled();
  });

  it('replacing the Room detaches previous listener', () => {
    const a: any = makeRoom();
    const b: any = makeRoom();
    registerRoomMetadataRoom('party', 'p1', a);
    registerRoomMetadataRoom('party', 'p1', b);
    expect(a.off).toHaveBeenCalled();
  });

  it('readRoomMetadata parses JSON blob', () => {
    const r: any = makeRoom(JSON.stringify({ song: 'hello', votes: 3 }));
    registerRoomMetadataRoom('call', 'c1', r);
    const out = readRoomMetadata('call', 'c1');
    expect(out.raw).toBe(JSON.stringify({ song: 'hello', votes: 3 }));
    expect(out.metadata).toEqual({ song: 'hello', votes: 3 });
  });

  it('readRoomMetadata returns null metadata for non-JSON blob', () => {
    const r: any = makeRoom('plain-string');
    registerRoomMetadataRoom('call', 'c2', r);
    const out = readRoomMetadata('call', 'c2');
    expect(out.raw).toBe('plain-string');
    expect(out.metadata).toBeNull();
  });

  it('emits window event on roomMetadataChanged', () => {
    const r: any = makeRoom();
    registerRoomMetadataRoom('live', 's2', r);
    const events: any[] = [];
    const h = (ev: Event) => events.push((ev as CustomEvent).detail);
    window.addEventListener('livekit-room-metadata', h);
    r._emit('roomMetadataChanged', JSON.stringify({ theme: 'gold' }));
    window.removeEventListener('livekit-room-metadata', h);
    const matching = events.filter((e) => e.scope === 'live' && e.id === 's2');
    // initial register also emits current value (''); then the change emits gold.
    expect(matching.some((e) => e.metadata?.theme === 'gold')).toBe(true);
  });

  it('setRoomMetadata invokes edge function with correct payload', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    await setRoomMetadata('live', 'stream-123', {
      roomName: 'live_stream-123',
      metadata: { song: 'x', poll: { q: 'a?' } },
    });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('livekit-room-metadata', {
      body: {
        action: 'set',
        scope: 'live',
        scopeId: 'stream-123',
        roomName: 'live_stream-123',
        metadata: { song: 'x', poll: { q: 'a?' } },
      },
    });
  });

  it('setRoomMetadata accepts null to clear', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    await setRoomMetadata('party', 'p2', {
      roomName: 'party_p2',
      metadata: null,
    });
    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'livekit-room-metadata',
      expect.objectContaining({ body: expect.objectContaining({ metadata: null }) }),
    );
  });

  it('setRoomMetadata throws on edge-function error', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    (supabase.functions.invoke as any).mockResolvedValueOnce({
      data: null,
      error: { message: 'room_metadata_disabled' },
    });
    await expect(
      setRoomMetadata('call', 'c9', { roomName: 'call_c9', metadata: {} }),
    ).rejects.toThrow('room_metadata_disabled');
  });

  it('setRoomMetadata throws on edge-function payload error', async () => {
    const { supabase } = await import('@/integrations/supabase/client');
    (supabase.functions.invoke as any).mockResolvedValueOnce({
      data: { error: 'not_room_owner' },
      error: null,
    });
    await expect(
      setRoomMetadata('live', 's3', { roomName: 'live_s3', metadata: {} }),
    ).rejects.toThrow('not_room_owner');
  });

  it('readRoomMetadata is empty for unregistered scope/id', () => {
    const out = readRoomMetadata('party', 'never');
    expect(out).toEqual({ raw: '', metadata: null });
  });
});
