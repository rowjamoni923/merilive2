// Pkg130: update-permission client unit tests.
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
  updateParticipantPermission,
  promoteToSpeaker,
  demoteToAudience,
  enableGhostMode,
  PROMOTE_TO_SPEAKER,
  DEMOTE_TO_AUDIENCE,
  GHOST_MODE,
} from '@/lib/livekitUpdatePermission';

describe('Pkg130 updateParticipantPermission', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    isEnabledMock.mockReset();
  });

  it('rejects when roomName or identity missing', async () => {
    isEnabledMock.mockResolvedValue(true);
    const a = await updateParticipantPermission({
      roomName: '',
      identity: 'u1',
      permission: { canPublish: true },
    });
    expect(a).toEqual({ success: false, error: 'missing_required_fields' });
    const b = await updateParticipantPermission({
      roomName: 'r',
      identity: '',
      permission: { canPublish: true },
    });
    expect(b).toEqual({ success: false, error: 'missing_required_fields' });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('rejects empty permission patch', async () => {
    isEnabledMock.mockResolvedValue(true);
    const r = await updateParticipantPermission({
      roomName: 'r',
      identity: 'u1',
      permission: {},
    });
    expect(r).toEqual({ success: false, error: 'invalid_or_empty_permission' });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('returns update_permission_disabled when kill-switch off', async () => {
    isEnabledMock.mockResolvedValue(false);
    const r = await updateParticipantPermission({
      roomName: 'r',
      identity: 'u1',
      permission: { canPublish: true },
    });
    expect(r).toEqual({ success: false, error: 'update_permission_disabled' });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('happy path forwards body and returns result', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({
      data: { success: true, result: { identity: 'u1' } },
      error: null,
    });
    const r = await updateParticipantPermission({
      roomName: 'live_a',
      identity: 'u1',
      permission: { canPublish: true, canSubscribe: true },
      reason: 'promote',
    });
    expect(r).toEqual({ success: true, result: { identity: 'u1' } });
    expect(invokeMock).toHaveBeenCalledWith('livekit-update-permission', {
      body: {
        roomName: 'live_a',
        identity: 'u1',
        permission: { canPublish: true, canSubscribe: true },
        reason: 'promote',
      },
    });
  });

  it('omits reason when not provided', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({ data: { success: true }, error: null });
    await updateParticipantPermission({
      roomName: 'r',
      identity: 'u1',
      permission: { hidden: true },
    });
    expect(invokeMock).toHaveBeenCalledWith('livekit-update-permission', {
      body: { roomName: 'r', identity: 'u1', permission: { hidden: true } },
    });
  });

  it('surfaces edge function error', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const r = await updateParticipantPermission({
      roomName: 'r',
      identity: 'u1',
      permission: { canPublish: false },
    });
    expect(r).toEqual({ success: false, error: 'boom' });
  });

  it('surfaces server-side success:false', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({
      data: { success: false, error: 'not_room_host' },
      error: null,
    });
    const r = await updateParticipantPermission({
      roomName: 'r',
      identity: 'u1',
      permission: { canPublish: false },
    });
    expect(r).toEqual({ success: false, error: 'not_room_host' });
  });

  it('promoteToSpeaker sugar uses PROMOTE_TO_SPEAKER preset', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({ data: { success: true }, error: null });
    await promoteToSpeaker('live_a', 'u1', 'queue->stage');
    expect(invokeMock).toHaveBeenCalledWith('livekit-update-permission', {
      body: {
        roomName: 'live_a',
        identity: 'u1',
        permission: PROMOTE_TO_SPEAKER,
        reason: 'queue->stage',
      },
    });
  });

  it('demoteToAudience sugar uses DEMOTE_TO_AUDIENCE preset', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({ data: { success: true }, error: null });
    await demoteToAudience('party_x', 'u2');
    expect(invokeMock).toHaveBeenCalledWith('livekit-update-permission', {
      body: {
        roomName: 'party_x',
        identity: 'u2',
        permission: DEMOTE_TO_AUDIENCE,
      },
    });
  });

  it('enableGhostMode sugar uses GHOST_MODE preset', async () => {
    isEnabledMock.mockResolvedValue(true);
    invokeMock.mockResolvedValue({ data: { success: true }, error: null });
    await enableGhostMode('live_a', 'u3', 'shadow-ban');
    expect(invokeMock).toHaveBeenCalledWith('livekit-update-permission', {
      body: {
        roomName: 'live_a',
        identity: 'u3',
        permission: GHOST_MODE,
        reason: 'shadow-ban',
      },
    });
  });
});
