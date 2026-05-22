/**
 * Pkg134: LiveKit Move Participant — client helpers
 *
 * Atomically MOVES a participant from one LiveKit room to another via
 * `RoomServiceClient.moveParticipant`. Unlike Pkg128 `forwardParticipant`
 * (which duplicates the participant into the destination room), this API
 * disconnects them from the source room and reconnects in the destination
 * with the same identity — atomic single-room membership.
 *
 * Use cases: PK battle stage handoff, breakout-room return, host transferring
 * a participant from waiting room to main room.
 *
 * Auth on the edge function:
 *   • Admin (x-admin-access-token) → any src/dst room.
 *   • Host  (Supabase JWT)         → src room must be one they own
 *                                    (live_streams.host_id or party_rooms.host_id).
 *
 * Kill-switch: `app_settings.livekit_signaling_enabled.move_participant`
 * (default OFF — admin must opt in).
 *
 * Zero new Supabase Realtime channels. Zero polls. Money/audit always via
 * Supabase RPC first — this lib only invokes the move edge fn.
 */
import { supabase } from '@/integrations/supabase/client';
import { isLiveKitEnabled } from '@/lib/livekitSignaling';

export interface MoveParticipantArgs {
  /** LiveKit room_name the participant is currently in. */
  srcRoom: string;
  /** LiveKit room_name to move them to. */
  dstRoom: string;
  /** The participant identity (== profiles.id in our setup). */
  identity: string;
  /** Optional moderation reason captured in the audit log (≤ 500 chars). */
  reason?: string;
}

export interface MoveParticipantResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Host or admin invokes the `livekit-move-participant` edge function.
 * Returns `{success:false, error:'move_participant_disabled'}` when the
 * kill-switch is OFF — never throws.
 */
export async function moveParticipant(
  args: MoveParticipantArgs,
): Promise<MoveParticipantResult> {
  const { srcRoom, dstRoom, identity, reason } = args;
  if (!srcRoom || !dstRoom || !identity) {
    return { success: false, error: 'missing_required_fields' };
  }
  if (srcRoom === dstRoom) {
    return { success: false, error: 'src_and_dst_must_differ' };
  }

  const enabled = await isLiveKitEnabled('move_participant');
  if (!enabled) return { success: false, error: 'move_participant_disabled' };

  const body: Record<string, unknown> = { srcRoom, dstRoom, identity };
  if (reason) body.reason = reason;

  const { data, error } = await supabase.functions.invoke(
    'livekit-move-participant',
    { body },
  );

  if (error) return { success: false, error: error.message };
  if (data?.success) return { success: true, result: data.result };
  return { success: false, error: data?.error ?? 'unknown_error' };
}
