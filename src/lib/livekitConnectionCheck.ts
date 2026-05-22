/**
 * Pkg190 — LiveKit ConnectionCheck wrapper (Item #2).
 *
 * Runs the official livekit-client ConnectionCheck suite against our SFU
 * (wss://livekit.merilive.xyz) so the user can diagnose, before going live,
 * whether their network can:
 *   - reach the WebSocket signal endpoint
 *   - establish a WebRTC PeerConnection
 *   - traverse via TURN when direct UDP fails
 *   - publish audio and video
 *   - re-establish after a forced reconnect
 *
 * Token is fetched via our normal `livekit-token` edge function on a throw-away
 * probe room (`__cc_<userId>_<ts>`). The room is auto-cleaned by LiveKit when
 * the temporary participant disconnects, so no server state leaks.
 *
 * $1400-rule safe: zero new Supabase channels, zero polling, fires only when
 * the user explicitly taps "Test connection".
 */
import { ConnectionCheck, CheckStatus, type ChecksResults, type CheckInfo } from 'livekit-client';
import { getLiveKitToken } from '@/services/livekitService';
import { supabase } from '@/integrations/supabase/client';

export type CheckRunStatus = 'idle' | 'running' | 'success' | 'failed';

export interface ConnectionCheckUpdate {
  checks: CheckInfo[];
  overall: CheckRunStatus;
}

export async function runConnectionCheck(
  onUpdate: (update: ConnectionCheckUpdate) => void,
): Promise<ConnectionCheckUpdate> {
  // Get current user to namespace the probe room.
  const { data: { user } } = await supabase.auth.getUser();
  const probeRoom = `__cc_${user?.id ?? 'anon'}_${Date.now()}`;

  const tok = await getLiveKitToken(probeRoom, 'call', 'cc-probe');
  if (!tok?.token || !tok?.url) {
    throw new Error('Failed to obtain LiveKit token for ConnectionCheck');
  }

  const check = new ConnectionCheck(tok.url, tok.token);

  const emit = () => {
    const results = check.getResults();
    const overall: CheckRunStatus = results.some((r) => r.status === CheckStatus.RUNNING)
      ? 'running'
      : results.every((r) => r.status === CheckStatus.SUCCESS || r.status === CheckStatus.SKIPPED)
        ? 'success'
        : 'failed';
    onUpdate({ checks: results, overall });
  };

  check.on('checkUpdate', emit);

  onUpdate({ checks: [], overall: 'running' });

  // Run the standard suite sequentially (LiveKit's recommended pattern).
  await check.checkWebsocket().catch(() => {});
  emit();
  await check.checkWebRTC().catch(() => {});
  emit();
  await check.checkTURN().catch(() => {});
  emit();
  await check.checkReconnect().catch(() => {});
  emit();
  await check.checkPublishAudio().catch(() => {});
  emit();
  await check.checkPublishVideo().catch(() => {});
  emit();
  await check.checkConnectionProtocol().catch(() => {});
  emit();

  const finalResults = check.getResults();
  const overall: CheckRunStatus = finalResults.every(
    (r) => r.status === CheckStatus.SUCCESS || r.status === CheckStatus.SKIPPED,
  )
    ? 'success'
    : 'failed';

  const out = { checks: finalResults, overall };
  onUpdate(out);
  return out;
}

export { CheckStatus };
export type { CheckInfo, ChecksResults };
