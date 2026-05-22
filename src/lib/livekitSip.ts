// Pkg110: LiveKit SIP dial-out client helpers.
// Hosts can add a phone-number participant (audio-only) to their live stream room.
// Requires LiveKit SIP outbound trunk pre-configured (env LIVEKIT_SIP_TRUNK_ID).
//
// Kill-switch: app_settings.livekit_signaling_enabled.sip === true
// Pure REST — zero Supabase Realtime channels, zero polling.
import { supabase } from '@/integrations/supabase/client';
import { isLiveKitEnabled } from './livekitSignaling';

export interface SipDialResult {
  sipParticipantId: string;
  sipCallId: string | null;
  logId: string | null;
}

/**
 * Dial a phone number into the host's live stream room.
 * `phoneNumber` must be E.164 (e.g. "+12025550101").
 */
export async function sipDial(
  streamId: string,
  phoneNumber: string,
  participantName?: string,
): Promise<SipDialResult | null> {
  if (!streamId || !phoneNumber) return null;
  if (!(await isLiveKitEnabled('sip'))) return null;

  const { data, error } = await supabase.functions.invoke('livekit-sip', {
    body: { action: 'dial', streamId, phoneNumber, participantName },
  });
  if (error) {
    console.warn('[Pkg110] sipDial error', error);
    return null;
  }
  if (!data || !data.sipParticipantId) return null;
  return {
    sipParticipantId: data.sipParticipantId,
    sipCallId: data.sipCallId ?? null,
    logId: data.logId ?? null,
  };
}

/** Hang up an active SIP participant. Best-effort. */
export async function sipHangup(
  sipParticipantId: string,
  roomName: string,
): Promise<boolean> {
  if (!sipParticipantId || !roomName) return false;
  try {
    const { error } = await supabase.functions.invoke('livekit-sip', {
      body: { action: 'hangup', sipParticipantId, roomName },
    });
    if (error) {
      console.warn('[Pkg110] sipHangup error', error);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('[Pkg110] sipHangup threw', e);
    return false;
  }
}
