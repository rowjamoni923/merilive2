/**
 * Pkg128: LiveKit Move/Forward Participant — client helpers
 *
 * Move a participant from one LiveKit room to another atomically via
 * `RoomServiceClient.forwardParticipant`. The participant's client SDK
 * auto-reconnects to the destination room with the same identity — no
 * client-side rejoin or fresh token required.
 *
 * Auth on the edge function:
 *   • Admin (x-admin-access-token) → any src/dst room.
 *   • Host  (Supabase JWT)         → src room must be one they own
 *                                    (live_streams.host_id or party_rooms.host_id).
 *
 * Kill-switch: `app_settings.livekit_signaling_enabled.forward_participant`
 * (default OFF — admin must opt in).
 *
 * Zero new Supabase Realtime channels. Zero polls. Money/audit always via
 * Supabase RPC first — this lib only invokes the moderation edge fn.
 */
import { supabase } from '@/integrations/supabase/client';
import { isLiveKitEnabled } from '@/lib/livekitSignaling';

export interface ForwardParticipantArgs {
  /** LiveKit room_name the participant is currently in. */
  srcRoom: string;
  /** LiveKit room_name to move them to. */
  dstRoom: string;
  /** The participant identity (== profiles.id in our setup). */
  identity: string;
  /** Optional moderation reason captured in the audit log (≤ 500 chars). */
  reason?: string;
}

export interface ForwardParticipantResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Host or admin invokes the `livekit-forward-participant` edge function.
 * Returns `{success:false, error:'forward_participant_disabled'}` when the
 * kill-switch is OFF — never throws.
 */
export async function forwardParticipant(
  args: ForwardParticipantArgs,
): Promise<ForwardParticipantResult> {
  const { srcRoom, dstRoom, identity, reason } = args;
  if (!srcRoom || !dstRoom || !identity) {
    return { success: false, error: 'missing_required_fields' };
  }
  if (srcRoom === dstRoom) {
    return { success: false, error: 'src_and_dst_must_differ' };
  }

  const enabled = await isLiveKitEnabled('forward_participant');
  if (!enabled) return { success: false, error: 'forward_participant_disabled' };

  const body: Record<string, unknown> = { srcRoom, dstRoom, identity };
  if (reason) body.reason = reason;

  const { data, error } = await supabase.functions.invoke(
    'livekit-forward-participant',
    { body },
  );

  if (error) return { success: false, error: error.message };
  if (data?.success) return { success: true, result: data.result };
  return { success: false, error: data?.error ?? 'unknown_error' };
}
