import {
  ConnectionErrorReason,
  type Room,
  type RoomConnectOptions,
  type ConnectionError,
} from 'livekit-client';

type LiveKitConnectProfile = 'live' | 'party' | 'call' | 'preload' | 'pk-opponent';

const isMobileLike = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile|Mobi/i.test(ua);
};

export const isLiveKitPeerConnectionError = (error: unknown) => {
  const err = error as Partial<ConnectionError> & { reasonName?: string; message?: string; name?: string };
  const message = String(err?.message || '').toLowerCase();
  return err?.name === 'ConnectionError' && (
    message.includes('could not establish pc connection') ||
    err.reason === ConnectionErrorReason.InternalError ||
    err.reasonName === 'InternalError'
  );
};

export const describeLiveKitConnectFailure = (error: unknown) => {
  if (isLiveKitPeerConnectionError(error)) {
    return 'Live video server connection failed. Please switch network and try again.';
  }
  return error instanceof Error ? error.message : 'Unable to join live room.';
};

const connectOptions = (profile: LiveKitConnectProfile, relayOnly = false): RoomConnectOptions => {
  const mobile = isMobileLike();
  const realtimeProfile = profile === 'live' || profile === 'party' || profile === 'call';
  return {
    autoSubscribe: true,
    maxRetries: relayOnly ? 1 : 2,
    websocketTimeout: mobile ? 22_000 : 18_000,
    peerConnectionTimeout: realtimeProfile
      ? mobile ? 32_000 : 24_000
      : mobile ? 24_000 : 18_000,
    rtcConfig: {
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: mobile ? 4 : 2,
      ...(relayOnly ? { iceTransportPolicy: 'relay' as RTCIceTransportPolicy } : {}),
    },
  };
};

export async function connectLiveKitRoom(
  room: Room,
  url: string,
  token: string,
  profile: LiveKitConnectProfile,
): Promise<void> {
  // Phase 5 (instant-entry): force the connection pool to refresh one
  // standby slot RIGHT NOW so the about-to-fire TCP/TLS handshake below
  // resumes from a fresh session ticket instead of doing a full cold
  // handshake. Non-blocking; fire-and-forget. No-op if pool not booted
  // (admin routes, public pages) or wildcard viewer token not yet cached.
  try {
    void import('@/services/livekitConnectionPool').then(({ pulseConnectionPool }) => {
      pulseConnectionPool();
    });
  } catch {
    /* non-fatal */
  }
  try {
    await room.connect(url, token, connectOptions(profile));
    return;
  } catch (firstError) {
    if (!isLiveKitPeerConnectionError(firstError)) throw firstError;
    // Mobile carriers/firewalls often fail direct ICE first; if the SFU exposes
    // TURN, a relay-only retry is the correct LiveKit/WebRTC fallback.
    await new Promise((resolve) => setTimeout(resolve, 650));
    try {
      await room.connect(url, token, connectOptions(profile, true));
      return;
    } catch (relayError) {
      console.error('[LiveKitConnect] PeerConnection failed after relay retry', {
        profile,
        first: firstError instanceof Error ? firstError.message : String(firstError),
        relay: relayError instanceof Error ? relayError.message : String(relayError),
      });
      throw relayError;
    }
  }
}