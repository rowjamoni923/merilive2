import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@/integrations/supabase/adminClient', () => ({
  adminSupabase: { functions: { invoke: (...a: unknown[]) => invokeMock(...a) } },
}));

import {
  listLiveKitRooms,
  listLiveKitRoomParticipants,
  getLiveKitRoom,
} from '@/lib/livekitRoomOps';

describe('Pkg135 livekitRoomOps', () => {
  beforeEach(() => invokeMock.mockReset());

  it('listLiveKitRooms unwraps rooms[]', async () => {
    invokeMock.mockResolvedValue({
      data: { rooms: [{ sid: 'r1', name: 'live_1', numParticipants: 3 }] },
      error: null,
    });
    const out = await listLiveKitRooms();
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('live_1');
    expect(invokeMock).toHaveBeenCalledWith('livekit-room-ops', {
      body: { action: 'list_rooms' },
    });
  });

  it('listLiveKitRooms returns [] when missing', async () => {
    invokeMock.mockResolvedValue({ data: {}, error: null });
    expect(await listLiveKitRooms()).toEqual([]);
  });

  it('listLiveKitRoomParticipants requires roomName', async () => {
    await expect(listLiveKitRoomParticipants('')).rejects.toThrow(/room_name_required/);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('listLiveKitRoomParticipants forwards roomName', async () => {
    invokeMock.mockResolvedValue({
      data: { participants: [{ sid: 'p1', identity: 'u1' }] },
      error: null,
    });
    const out = await listLiveKitRoomParticipants('live_42');
    expect(out).toHaveLength(1);
    expect(invokeMock).toHaveBeenCalledWith('livekit-room-ops', {
      body: { action: 'list_participants', roomName: 'live_42' },
    });
  });

  it('getLiveKitRoom returns room + participants', async () => {
    invokeMock.mockResolvedValue({
      data: { room: { sid: 'r1', name: 'live_7' }, participants: [] },
      error: null,
    });
    const out = await getLiveKitRoom('live_7');
    expect(out.room?.name).toBe('live_7');
    expect(Array.isArray(out.participants)).toBe(true);
  });

  it('getLiveKitRoom requires roomName', async () => {
    await expect(getLiveKitRoom('')).rejects.toThrow(/room_name_required/);
  });

  it('propagates edge fn error field', async () => {
    invokeMock.mockResolvedValue({ data: { error: 'room_ops_disabled' }, error: null });
    await expect(listLiveKitRooms()).rejects.toThrow(/room_ops_disabled/);
  });

  it('propagates transport error', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('network_fail') });
    await expect(listLiveKitRooms()).rejects.toThrow(/network_fail/);
  });
});
