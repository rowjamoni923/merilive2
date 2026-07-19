// Pkg127 host moderation client unit tests.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

const isEnabledMock = vi.fn();
vi.mock('@/lib/livekitSignaling', () => ({
  isLiveKitEnabled: (...args: unknown[]) => isEnabledMock(...args),
}));

import {
  hostMuteAllAudio,
  hostUnmuteAllAudio,
  hostMuteParticipantAudio,
  hostUnmuteParticipantAudio,
  hostKickParticipant,
} from '@/lib/livekitModeration';

describe('Pkg127 host moderation', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    isEnabledMock.mockReset();
  });

  it('returns moderation_disabled when kill-switch off', async () => {
    isEnabledMock.mockResolvedValue(false);
    const r = await hostMuteAllAudio({ roomName: 'live_x' });
    expect(r).toEqual({ success: false, error: 'moderation_disabled' });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('mute_all_audio happy path', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({
      data: { success: true, result: { participants: 3, tracks: 5 } },
      error: null,
    });
    const r = await hostMuteAllAudio({ roomName: 'live_x', reason: 'noise' });
    expect(r).toEqual({ success: true, result: { participants: 3, tracks: 5 } });
    expect(invokeMock).toHaveBeenCalledWith('livekit-moderate', {
      body: { action: 'mute_all_audio', roomName: 'live_x', reason: 'noise' },
    });
  });

  it('unmute_all_audio happy path', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({
      data: { success: true, result: { participants: 2, tracks: 2 } },
      error: null,
    });
    const r = await hostUnmuteAllAudio({ roomName: 'live_x' });
    expect(r.success).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('livekit-moderate', {
      body: { action: 'unmute_all_audio', roomName: 'live_x' },
    });
  });

  it('mute_participant_audio forwards identity', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({
      data: { success: true, result: { tracks_muted: 1 } },
      error: null,
    });
    const r = await hostMuteParticipantAudio({ roomName: 'live_x', identity: 'user_42' });
    expect(r.success).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('livekit-moderate', {
      body: { action: 'mute_participant_audio', roomName: 'live_x', identity: 'user_42' },
    });
  });

  it('unmute_participant_audio forwards identity', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({
      data: { success: true, result: { tracks_unmuted: 1 } },
      error: null,
    });
    const r = await hostUnmuteParticipantAudio({ roomName: 'live_x', identity: 'user_42' });
    expect(r.success).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('livekit-moderate', {
      body: { action: 'unmute_participant_audio', roomName: 'live_x', identity: 'user_42' },
    });
  });

  it('kick_participant forwards identity + reason', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({
      data: { success: true, result: { removed: 'user_42' } },
      error: null,
    });
    const r = await hostKickParticipant({ roomName: 'live_x', identity: 'user_42', reason: 'abuse' });
    expect(r.success).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith('livekit-moderate', {
      body: { action: 'kick_participant', roomName: 'live_x', identity: 'user_42', reason: 'abuse' },
    });
  });

  it('surfaces edge function error', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const r = await hostKickParticipant({ roomName: 'live_x', identity: 'u' });
    expect(r).toEqual({ success: false, error: 'boom' });
  });

  it('surfaces server-side success:false', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({
      data: { success: false, error: 'not_room_host' },
      error: null,
    });
    const r = await hostMuteAllAudio({ roomName: 'live_y' });
    expect(r).toEqual({ success: false, error: 'not_room_host' });
  });
});
