/**
 * Pkg110: LiveKit SIP dial-out client tests
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
vi.mock('@/lib/livekitSignaling', () => ({
  isLiveKitEnabled: vi.fn(),
}));

import { supabase } from '@/integrations/supabase/client';
import { isLiveKitEnabled } from '@/lib/livekitSignaling';
import { sipDial, sipHangup } from '@/lib/livekitSip';

describe('Pkg110 livekitSip', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sipDial returns null when kill-switch off', async () => {
    (isLiveKitEnabled as any).mockResolvedValue(false);
    expect(await sipDial('s1', '+12025550101')).toBeNull();
    expect((supabase.functions.invoke as any)).not.toHaveBeenCalled();
  });

  it('sipDial returns null when args missing', async () => {
    expect(await sipDial('', '+12025550101')).toBeNull();
    expect(await sipDial('s1', '')).toBeNull();
  });

  it('sipDial maps edge function success', async () => {
    (isLiveKitEnabled as any).mockResolvedValue(true);
    (supabase.functions.invoke as any).mockResolvedValue({
      data: { sipParticipantId: 'SIP_P_1', sipCallId: 'SIP_C_1', logId: 'L1' },
      error: null,
    });
    expect(await sipDial('s1', '+12025550101', 'Guest')).toEqual({
      sipParticipantId: 'SIP_P_1', sipCallId: 'SIP_C_1', logId: 'L1',
    });
    expect((supabase.functions.invoke as any)).toHaveBeenCalledWith('livekit-sip', {
      body: { action: 'dial', streamId: 's1', phoneNumber: '+12025550101', participantName: 'Guest' },
    });
  });

  it('sipDial returns null on edge function error', async () => {
    (isLiveKitEnabled as any).mockResolvedValue(true);
    (supabase.functions.invoke as any).mockResolvedValue({
      data: null, error: { message: 'sip_disabled' },
    });
    expect(await sipDial('s1', '+12025550101')).toBeNull();
  });

  it('sipDial returns null when response lacks participant id', async () => {
    (isLiveKitEnabled as any).mockResolvedValue(true);
    (supabase.functions.invoke as any).mockResolvedValue({ data: {}, error: null });
    expect(await sipDial('s1', '+12025550101')).toBeNull();
  });

  it('sipHangup invokes edge function with action=hangup', async () => {
    (supabase.functions.invoke as any).mockResolvedValue({ data: { ok: true }, error: null });
    expect(await sipHangup('SIP_P_1', 'live_s1')).toBe(true);
    expect((supabase.functions.invoke as any)).toHaveBeenCalledWith('livekit-sip', {
      body: { action: 'hangup', sipParticipantId: 'SIP_P_1', roomName: 'live_s1' },
    });
  });

  it('sipHangup returns false on missing args', async () => {
    expect(await sipHangup('', 'r')).toBe(false);
    expect(await sipHangup('p', '')).toBe(false);
  });
});
