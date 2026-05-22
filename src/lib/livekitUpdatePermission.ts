/**
 * Pkg130: LiveKit Participant Permission Update — client helpers
 *
 * Promote / demote a participant in-place by mutating their server-side
 * `ParticipantPermission`. Their SDK transparently starts/stops publishing
 * camera, mic, or screen-share without disconnect — same identity, same
 * tracks-as-subscriber state. Industry-standard "audience ⇄ speaker" /
 * "ghost mode" pattern used in Stage / Spaces apps.
 *
 * Auth on the edge function:
 *   • Admin (x-admin-access-token) → any room.
 *   • Host  (Supabase JWT)         → must own the room
 *                                    (live_streams.host_id or party_rooms.host_id).
 *
 * Kill-switch: `app_settings.livekit_signaling_enabled.update_permission`
 * (default OFF — admin opts in).
 *
 * Zero new Supabase Realtime channels. Zero polls. No cross-user profile
 * reads. Money/audit ALWAYS via Supabase RPC first — this lib only invokes
 * the moderation edge fn.
 */
import { supabase } from '@/integrations/supabase/client';
import { isLiveKitEnabled } from '@/lib/livekitSignaling';

export interface ParticipantPermissionPatch {
  /** Can this participant subscribe to other participants' tracks? */
  canSubscribe?: boolean;
  /** Can this participant publish ANY track? Master flag. */
  canPublish?: boolean;
  /** Can this participant publish DataPackets (chat/gifts/signaling)? */
  canPublishData?: boolean;
  /**
   * Restrict which sources the participant may publish. Valid values:
   *   'camera' | 'microphone' | 'screen_share' | 'screen_share_audio'.
   * Omit to allow all sources (when canPublish=true).
   */
  canPublishSources?: Array<
    'camera' | 'microphone' | 'screen_share' | 'screen_share_audio'
  >;
  /** Hide this participant from the participant list (ghost / observer). */
  hidden?: boolean;
  /** May they call setMetadata on their own LocalParticipant? */
  canUpdateMetadata?: boolean;
}

export interface UpdatePermissionArgs {
  /** LiveKit room_name (live_streams.room_name or party_rooms.room_name). */
  roomName: string;
  /** Participant identity (== profiles.id in our setup). */
  identity: string;
  /** Permission patch. At least one allowed key must be set. */
  permission: ParticipantPermissionPatch;
  /** Optional moderation reason (≤ 500 chars) captured in audit log. */
  reason?: string;
}

export interface UpdatePermissionResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

/** Preset: promote audience member → full speaker (camera + mic + screen). */
export const PROMOTE_TO_SPEAKER: ParticipantPermissionPatch = {
  canPublish: true,
  canSubscribe: true,
  canPublishData: true,
  canPublishSources: ['camera', 'microphone', 'screen_share', 'screen_share_audio'],
};

/** Preset: demote speaker → audience (subscribe + chat only, no publish). */
export const DEMOTE_TO_AUDIENCE: ParticipantPermissionPatch = {
  canPublish: false,
  canSubscribe: true,
  canPublishData: true,
};

/** Preset: mute-lock — keep on stage but block mic (cannot un-mute self). */
export const MIC_ONLY_LOCK: ParticipantPermissionPatch = {
  canPublish: true,
  canSubscribe: true,
  canPublishData: true,
  canPublishSources: ['camera', 'screen_share'],
};

/** Preset: full ghost / shadow-ban — observer-only, hidden from the list. */
export const GHOST_MODE: ParticipantPermissionPatch = {
  canPublish: false,
  canPublishData: false,
  canSubscribe: true,
  hidden: true,
};

/**
 * Host or admin invokes the `livekit-update-permission` edge function.
 * Never throws. Returns `{success:false, error:'update_permission_disabled'}`
 * when the kill-switch is OFF.
 */
export async function updateParticipantPermission(
  args: UpdatePermissionArgs,
): Promise<UpdatePermissionResult> {
  const { roomName, identity, permission, reason } = args;
  if (!roomName || !identity) {
    return { success: false, error: 'missing_required_fields' };
  }
  if (
    !permission ||
    typeof permission !== 'object' ||
    Object.keys(permission).length === 0
  ) {
    return { success: false, error: 'invalid_or_empty_permission' };
  }

  const enabled = await isLiveKitEnabled('update_permission');
  if (!enabled) return { success: false, error: 'update_permission_disabled' };

  const body: Record<string, unknown> = { roomName, identity, permission };
  if (reason) body.reason = reason;

  const { data, error } = await supabase.functions.invoke(
    'livekit-update-permission',
    { body },
  );

  if (error) return { success: false, error: error.message };
  if (data?.success) return { success: true, result: data.result };
  return { success: false, error: data?.error ?? 'unknown_error' };
}

// ── Sugar helpers built on presets ──────────────────────────────────────────

export const promoteToSpeaker = (
  roomName: string,
  identity: string,
  reason?: string,
) => updateParticipantPermission({ roomName, identity, permission: PROMOTE_TO_SPEAKER, reason });

export const demoteToAudience = (
  roomName: string,
  identity: string,
  reason?: string,
) => updateParticipantPermission({ roomName, identity, permission: DEMOTE_TO_AUDIENCE, reason });

export const lockMicrophone = (
  roomName: string,
  identity: string,
  reason?: string,
) => updateParticipantPermission({ roomName, identity, permission: MIC_ONLY_LOCK, reason });

export const enableGhostMode = (
  roomName: string,
  identity: string,
  reason?: string,
) => updateParticipantPermission({ roomName, identity, permission: GHOST_MODE, reason });
