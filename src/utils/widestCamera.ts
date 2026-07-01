import { releaseAndroidWebViewCameraWhenStopped } from '@/lib/androidCameraHandoff';
import { buildPortraitVideoFallbacks, isPortraitCameraTrack, stopMediaStream } from '@/utils/portraitCameraConstraints';

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const scoreWideCameraLabel = (label: string, facingMode: 'user' | 'environment'): number => {
  const normalized = label.toLowerCase();
  let score = 0;

  if (facingMode === 'user') {
    if (/front|user|selfie/.test(normalized)) score += 20;
    if (/back|rear|environment/.test(normalized)) score -= 40;
  } else {
    if (/back|rear|environment/.test(normalized)) score += 20;
    if (/front|user|selfie/.test(normalized)) score -= 40;
  }

  if (/ultra[\s-]?wide|wide[\s-]?angle|0\.5|0,5|0\.6|0,6|wide/.test(normalized)) score += 80;
  if (/tele|zoom|macro|depth|virtual|obs|screen|capture/.test(normalized)) score -= 50;

  return score;
};

export const maybeUpgradeToWidestCamera = async (
  initialStream: MediaStream,
  facingMode: 'user' | 'environment',
  source = 'camera',
): Promise<MediaStream> => {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return initialStream;

  let stoppedInitialVideo = false;

  try {
    const currentDeviceId = initialStream.getVideoTracks()[0]?.getSettings?.().deviceId;
    const devices = await navigator.mediaDevices.enumerateDevices();
    const candidates = devices
      .filter((device) => device.kind === 'videoinput' && device.deviceId && device.deviceId !== currentDeviceId)
      .map((device) => ({ device, score: scoreWideCameraLabel(device.label || '', facingMode) }))
      .filter(({ score }) => score >= 70)
      .sort((a, b) => b.score - a.score);

    const best = candidates[0]?.device;
    if (!best) return initialStream;

    const audioTracks = initialStream.getAudioTracks().filter((track) => track.readyState === 'live');
    const wideConstraints = buildPortraitVideoFallbacks({ deviceId: best.deviceId, frameRate: 30 });

    const openWideCandidate = async () => {
      for (const video of wideConstraints) {
        try {
          const wideStream = await withTimeout(
            navigator.mediaDevices.getUserMedia({ video, audio: false }),
            9000,
            'Wide camera request timed out',
          );
          const hasLiveVideo = wideStream.getVideoTracks().some((track) => track.readyState === 'live');
          if (!hasLiveVideo || !wideStream.getVideoTracks().some(isPortraitCameraTrack)) {
            stopMediaStream(wideStream);
            continue;
          }
          audioTracks.forEach((track) => {
            if (track.readyState === 'live') wideStream.addTrack(track);
          });
          releaseAndroidWebViewCameraWhenStopped(wideStream, `${source}:wide-camera:${facingMode}`);
          console.log('[Camera] Upgraded to widest available camera:', best.label || best.deviceId, source);
          return wideStream;
        } catch (error: any) {
          console.warn('[Camera] Wide camera candidate failed:', error?.name, error?.message, source);
        }
      }
      return null;
    };

    // Try without disturbing the current preview first. Some browsers allow two
    // temporary camera opens; if they do, this gives a seamless lens swap.
    const seamlessWide = await openWideCandidate();
    if (seamlessWide) {
      initialStream.getVideoTracks().forEach((track) => {
        try { track.stop(); } catch { /* ignore */ }
      });
      return seamlessWide;
    }

    // Android WebView often refuses a second camera while the default lens is
    // already open. For an actual zoom-out we must release that lens, open the
    // labelled wide/ultra-wide deviceId, then merge the still-live mic tracks.
    const initialVideoTracks = initialStream.getVideoTracks();
    initialVideoTracks.forEach((track) => {
      try { track.stop(); } catch { /* ignore */ }
    });
    stoppedInitialVideo = true;

    const exclusiveWide = await openWideCandidate();
    if (exclusiveWide) return exclusiveWide;

    // If the labelled wide device is not actually openable on this OEM WebView,
    // restore a normal video track so the caller never loses camera preview.
    for (const video of buildPortraitVideoFallbacks({ facingMode, frameRate: 30 })) {
      try {
        const restored = await withTimeout(
          navigator.mediaDevices.getUserMedia({ video, audio: false }),
          9000,
          'Restore camera request timed out',
        );
        audioTracks.forEach((track) => {
          if (track.readyState === 'live') restored.addTrack(track);
        });
        return restored;
      } catch {
        // keep trying lower fallbacks
      }
    }

    throw new Error('Unable to reopen camera after wide-lens selection failed');
  } catch (error) {
    console.warn('[Camera] Wide camera selection skipped:', error, source);
    if (stoppedInitialVideo) throw error;
  }

  return initialStream;
};