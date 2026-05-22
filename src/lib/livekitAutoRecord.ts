/**
 * Pkg129: Auto-record on room start — client preference helpers.
 *
 * Hosts opt-in once via `setAutoRecordPreference(true)`. Thereafter every
 * `live_streams` row they create with `is_active=true` automatically gets a
 * room-composite MP4 egress started server-side by the
 * `tg_auto_record_on_stream_start` DB trigger calling `livekit-auto-record`.
 *
 * Admin kill-switches (BOTH must be true at trigger time):
 *   • app_settings.livekit_signaling_enabled.egress      (Pkg111 master)
 *   • app_settings.livekit_signaling_enabled.auto_record (Pkg129)
 *
 * Zero new Supabase Realtime channels. Zero polls. No money / no audit on
 * this path — the recording itself is logged by Pkg112 webhook finalization.
 */
import { supabase } from '@/integrations/supabase/client';
import { isLiveKitEnabled } from '@/lib/livekitSignaling';

export interface AutoRecordPreferenceResult {
  success: boolean;
  enabled?: boolean;
  error?: string;
}

/**
 * Read the current host's auto-record preference. Returns `false` (not
 * disabled) when the user isn't logged in or the column is missing.
 */
export async function getAutoRecordPreference(): Promise<AutoRecordPreferenceResult> {
  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) return { success: false, error: 'not_authenticated' };

  const { data, error } = await supabase
    .from('profiles')
    .select('auto_record_live')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return { success: true, enabled: !!(data as { auto_record_live?: boolean } | null)?.auto_record_live };
}

/**
 * Set the current host's auto-record preference. Optionally short-circuits
 * with `auto_record_disabled` when the admin kill-switch is OFF (so the UI
 * can warn the host before flipping the toggle).
 */
export async function setAutoRecordPreference(
  enabled: boolean,
  opts: { ignoreKillSwitch?: boolean } = {},
): Promise<AutoRecordPreferenceResult> {
  const { data: u } = await supabase.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) return { success: false, error: 'not_authenticated' };

  if (enabled && !opts.ignoreKillSwitch) {
    const on = await isLiveKitEnabled('auto_record');
    if (!on) return { success: false, error: 'auto_record_disabled' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({ auto_record_live: enabled } as never)
    .eq('id', userId);
  if (error) return { success: false, error: error.message };
  return { success: true, enabled };
}
