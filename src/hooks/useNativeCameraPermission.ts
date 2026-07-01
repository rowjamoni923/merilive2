import { useState, useCallback } from 'react';
import { isNativeApp as detectNativeApp } from '@/utils/nativeUtils';
import { releaseAndroidWebViewCameraWhenStopped } from '@/lib/androidCameraHandoff';
import {
  requestCameraPermission as requestNativeCameraPermission,
  requestMicrophonePermission as requestNativeMicrophonePermission,
} from '@/utils/nativePermissions';
import { enforcePermanentCameraLock } from '@/utils/cameraLock';

interface CameraPermissionResult {
  granted: boolean;
  microphoneGranted?: boolean;
  error?: string;
}

interface CameraPermissionRequestOptions {
  includeMicrophone?: boolean;
}

// ========== GLOBAL PERMISSION CACHE ==========
const PERM_CACHE_KEY = 'merilive.av.perm.granted.v1';
const readCachedPerm = (): boolean => {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(PERM_CACHE_KEY) === '1'; } catch { return false; }
};
const writeCachedPerm = (granted: boolean) => {
  try { if (typeof localStorage !== 'undefined') {
    if (granted) localStorage.setItem(PERM_CACHE_KEY, '1');
    else localStorage.removeItem(PERM_CACHE_KEY);
  } } catch {}
};
let globalPermissionGranted: boolean | null = readCachedPerm() ? true : null;
let globalMicrophoneGranted: boolean | null = readCachedPerm() ? true : null;
let permissionRequestInFlight: Promise<CameraPermissionResult> | null = null;
let streamRequestInFlight: Promise<MediaStream> | null = null;
let permissionDeniedCount = 0;
const MAX_DENIAL_RETRIES = 2;


const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(timeoutMessage);
      (err as any).name = 'TimeoutError';
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

/**
 * Dialog-safe Permissions API query — works in modern Android WebView (Chromium 70+)
 * and all desktop/mobile browsers. Returns null when the API or that specific
 * permission name is not supported. NEVER triggers a permission dialog.
 */
const queryPermissionSafe = async (name: PermissionName): Promise<PermissionState | null> => {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return null;
  try {
    const result = await navigator.permissions.query({ name });
    return result.state;
  } catch {
    return null;
  }
};


/**
 * On native Android, media permission checks are handled by the Android
 * permission plugin. Web permission probes are browser-only.
 */
const queryPermission = async (name: PermissionName, isNative: boolean): Promise<PermissionState | null> => {
  // Android WebView often doesn't support permissions.query for camera/mic
  if (isNative) return null;
  if (!navigator.permissions?.query) return null;
  try {
    const result = await navigator.permissions.query({ name });
    return result.state;
  } catch {
    return null;
  }
};

/**
 * Browser-only getUserMedia request helper. Native Android live/party/call
 * paths must never call this because it opens a second WebView camera owner.
 */
const denialHint = (isNative: boolean): string =>
  isNative
    ? 'Camera permission denied. Open phone Settings → Apps → MeriLive → Permissions → Camera, set it to Allow, then return to the app.'
    : 'Camera blocked in your browser. Tap the lock/info icon next to the address bar → Site settings (Permissions) → Camera → Allow, then reload this page.';

const requestCameraViaGetUserMedia = async (includeAudio: boolean, isNative: boolean = false): Promise<{ granted: boolean; stream?: MediaStream; error?: string }> => {
  try {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return { granted: false, error: 'Your browser does not support camera access. Try the latest Chrome or Safari over HTTPS.' };
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      return { granted: false, error: 'Camera requires a secure (HTTPS) connection. Reload the site over HTTPS.' };
    }
    console.log('[Camera Permission] Requesting via getUserMedia, native:', isNative, 'audio:', includeAudio);
    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 1080 },
        height: { ideal: 1440 },
        resizeMode: 'none',
        frameRate: { ideal: 30 },
      } as unknown as MediaTrackConstraints,
      audio: includeAudio
    };
    const stream = await withTimeout(
      navigator.mediaDevices.getUserMedia(constraints),
      10000, // 10s timeout for native permission dialog
      'Camera permission request timed out'
    );
    await enforcePermanentCameraLock(stream, 'permission-request');
    releaseAndroidWebViewCameraWhenStopped(stream, `permission-probe:${includeAudio ? 'av' : 'video'}`);
    
    const hasVideo = stream.getVideoTracks().some(t => t.readyState === 'live');
    const hasAudio = !includeAudio || stream.getAudioTracks().some(t => t.readyState === 'live');
    
    if (!hasVideo) {
      stream.getTracks().forEach(t => t.stop());
      return { granted: false, error: 'Camera not available' };
    }
    
    // If we needed audio but didn't get it, try audio separately
    if (includeAudio && !hasAudio) {
      console.warn('[Camera Permission] Got video but no audio, requesting audio separately...');
      try {
        const audioStream = await withTimeout(
            navigator.mediaDevices.getUserMedia({ audio: true }),
          8000,
          'Microphone request timed out'
        );
        // Merge audio into the video stream
        audioStream.getAudioTracks().forEach(track => stream.addTrack(track));
      } catch (audioErr: any) {
        console.warn('[Camera Permission] Separate audio request failed:', audioErr?.name);
        // Still return success - camera works, mic doesn't
      }
    }
    
    return { granted: true, stream };
  } catch (err: any) {
    console.error('[Camera Permission] getUserMedia failed:', err?.name, err?.message);
    
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      return { granted: false, error: denialHint(isNative) };
    }
    if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
      return { granted: false, error: 'No usable camera was found on this device.' };
    }
    if (err.name === 'NotReadableError') {
      return { granted: false, error: 'Camera is busy. Close other apps/tabs using the camera and try again.' };
    }
    if (err.name === 'TimeoutError') {
      return { granted: false, error: 'Camera permission timed out. Please tap "Start Face Scan" again.' };
    }
    return { granted: false, error: err?.message || 'Camera access failed.' };
  }
};

export const getUserMediaWithFallback = async (includeAudio: boolean, facingMode: 'user' | 'environment' = 'user'): Promise<MediaStream> => {
  const audio: boolean | MediaTrackConstraints = includeAudio
    ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    : false;
  const constraintOptions: MediaStreamConstraints[] = [
    // Natural 3:4 sensor capture avoids CameraX/WebView center-crop zoom;
    // UI renderers keep portrait cover/fill so there are no black bars.
    { video: { facingMode: { ideal: facingMode }, width: { ideal: 1080 }, height: { ideal: 1440 }, resizeMode: 'none', frameRate: { ideal: 30 } } as unknown as MediaTrackConstraints, audio },
    { video: { facingMode: { ideal: facingMode }, width: { ideal: 720 }, height: { ideal: 960 }, resizeMode: 'none', frameRate: { ideal: 30 } } as unknown as MediaTrackConstraints, audio },
    { video: { facingMode: { ideal: facingMode }, width: { ideal: 540 }, height: { ideal: 720 }, resizeMode: 'none', frameRate: { ideal: 24 } } as unknown as MediaTrackConstraints, audio },
    { video: { facingMode: { ideal: facingMode } }, audio },
    { video: true, audio },
    { video: true, audio: false },
  ];

  let lastError: any = null;
  for (let i = 0; i < constraintOptions.length; i++) {
    try {
      console.log(`[Camera] Attempt ${i + 1}/${constraintOptions.length}`);
      const stream = await withTimeout(
        navigator.mediaDevices.getUserMedia(constraintOptions[i]),
        9000,
        'Camera stream request timed out',
      );
      releaseAndroidWebViewCameraWhenStopped(stream, `camera-stream:${i + 1}`);
      const videoTracks = stream.getVideoTracks();
      const hasLiveVideo = videoTracks.some((track) => track.readyState === 'live');
      if (!hasLiveVideo) {
        stream.getTracks().forEach((track) => track.stop());
        continue;
      }
      videoTracks.forEach((track) => {
        try { if ('contentHint' in track) (track as any).contentHint = 'motion'; } catch {}
      });
      await enforcePermanentCameraLock(stream, `camera-stream:${i + 1}`);
      return stream;
    } catch (err: any) {
      lastError = err;
      console.warn(`[Camera] Attempt ${i + 1} failed:`, err?.name, err?.message);
    }
  }
  throw lastError || new Error('Unable to access camera with any settings.');
};

/**
 * Hook to handle camera permission requests.
 * 
 * Native Android uses the Android runtime permission plugin only; actual
 * capture is owned by the NativeLiveKit SDK path. Browser getUserMedia stays
 * available only for non-native web surfaces.
 */
export function useNativeCameraPermission() {
  const [isRequesting, setIsRequesting] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(globalPermissionGranted);

  const isNativeApp = detectNativeApp();

  const requestCameraPermission = useCallback(async (
    options: CameraPermissionRequestOptions = {}
  ): Promise<CameraPermissionResult> => {
    const includeMicrophone = Boolean(options.includeMicrophone);

    // Fast path: already granted
    if (!isNativeApp && globalPermissionGranted === true && (!includeMicrophone || globalMicrophoneGranted === true)) {
      console.log('[Camera Permission] Already granted (cached)');
      return { granted: true, microphoneGranted: includeMicrophone ? true : undefined };
    }

    // Single-flight
    if (permissionRequestInFlight) {
      return permissionRequestInFlight;
    }

    setIsRequesting(true);
    console.log('[Camera Permission] Requesting, isNative:', isNativeApp, 'includeMic:', includeMicrophone);

    permissionRequestInFlight = (async (): Promise<CameraPermissionResult> => {
      try {
        if (isNativeApp) {
          // Native Android live/party/call must NEVER open a WebView
          // getUserMedia probe. It creates a second camera pipeline and can
          // leave Chromium's video surface showing the native play icon.
          const cameraGranted = await requestNativeCameraPermission();
          const microphoneGranted = includeMicrophone
            ? await requestNativeMicrophonePermission()
            : true;

          if (cameraGranted && microphoneGranted) {
            globalPermissionGranted = true; writeCachedPerm(true);
            if (includeMicrophone) globalMicrophoneGranted = true;
            permissionDeniedCount = 0;
            setPermissionGranted(true);
            return { granted: true, microphoneGranted: includeMicrophone ? true : undefined };
          }

          permissionDeniedCount++;
          setPermissionGranted(false);
          return {
            granted: false,
            microphoneGranted: includeMicrophone ? microphoneGranted : undefined,
            error: !cameraGranted ? denialHint(true) : 'Microphone permission denied.',
          };
        }

        // ===== WEB BROWSER =====
        const cameraState = await queryPermission('camera' as PermissionName, false);
        
        if (cameraState === 'denied') {
          permissionDeniedCount++;
          setPermissionGranted(false);
          return { granted: false, error: denialHint(false) };
        }

        if (cameraState !== 'granted') {
          const result = await requestCameraViaGetUserMedia(includeMicrophone, false);
          if (!result.granted) {
            permissionDeniedCount++;
            setPermissionGranted(false);
            return { granted: false, error: result.error };
          }
          result.stream?.getTracks().forEach(t => t.stop());
        }

        globalPermissionGranted = true; writeCachedPerm(true);
        permissionDeniedCount = 0;
        setPermissionGranted(true);

        // Handle microphone separately on web if not already requested
        if (includeMicrophone && globalMicrophoneGranted !== true && cameraState === 'granted') {
          try {
            const micStream = await withTimeout(
              navigator.mediaDevices.getUserMedia({ audio: true }),
              8000,
              'Microphone request timed out'
            );
            micStream.getTracks().forEach(t => t.stop());
            globalMicrophoneGranted = true;
          } catch {
            return { granted: false, microphoneGranted: false, error: 'Microphone permission denied.' };
          }
        } else if (includeMicrophone) {
          globalMicrophoneGranted = true;
        }

        return { granted: true, microphoneGranted: includeMicrophone ? true : undefined };
      } catch (error: any) {
        console.error('[Camera Permission] Failed:', error);
        setPermissionGranted(false);

        let errorMessage = 'Camera access failed.';
        if (error.name === 'NotAllowedError' || error.name === 'SecurityError') errorMessage = denialHint(isNativeApp);
        else if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') errorMessage = 'No usable camera was found on this device.';
        else if (error.name === 'NotReadableError') errorMessage = 'Camera is busy. Close other apps/tabs using the camera and try again.';
        else if (error.name === 'TimeoutError') errorMessage = 'Camera start timed out. Please try again.';

        return { granted: false, error: errorMessage };
      }
    })();

    try {
      return await permissionRequestInFlight;
    } finally {
      permissionRequestInFlight = null;
      setIsRequesting(false);
    }
  }, [isNativeApp]);

  const getCameraStream = useCallback(async (includeAudio: boolean = false): Promise<MediaStream | null> => {
    if (isNativeApp) {
      // Face Verification needs a real WebView MediaStream to render the
      // preview <video> and feed face-pose frames. The native LiveKit/CameraX
      // owner is reserved for live/party/call; for face-verify we open the
      // WebView camera directly (callers must release any other native owner
      // before invoking this — FaceVerification already does so).
      const permission = await requestCameraPermission({ includeMicrophone: includeAudio });
      if (!permission.granted) throw new Error(permission.error || 'Camera permission denied.');
      try {
        const stream = await getUserMediaWithFallback(includeAudio, 'user');
        globalPermissionGranted = true; writeCachedPerm(true);
        if (includeAudio) globalMicrophoneGranted = stream.getAudioTracks().some(t => t.readyState === 'live');
        setPermissionGranted(true);
        return stream;
      } catch (err: any) {
        console.error('[Camera] Native WebView getUserMedia failed:', err?.name, err?.message);
        if (err?.name === 'NotReadableError') {
          throw new Error('Camera is busy. End any live, party, or call session and try again.');
        }
        if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
          throw new Error(denialHint(true));
        }
        throw new Error(err?.message || 'Failed to open camera.');
      }
    }

    if (streamRequestInFlight) {
      return streamRequestInFlight;
    }

    streamRequestInFlight = (async () => {
      console.log('[Camera] Getting stream, includeAudio:', includeAudio);

      // IMPORTANT: the real stream request must happen directly from the user's
      // tap/click path. A separate permission probe before this can break the
      // Android WebView gesture chain and leave verification with a black or
      // unusable stream.

      let lastError: any = null;
      try {
        const stream = await getUserMediaWithFallback(includeAudio, 'user');
        const settings = stream.getVideoTracks()[0]?.getSettings?.();
        console.log('[Camera] Success:', JSON.stringify(settings || {}));
        globalPermissionGranted = true; writeCachedPerm(true);
        if (includeAudio) globalMicrophoneGranted = stream.getAudioTracks().some(t => t.readyState === 'live');
        permissionDeniedCount = 0;
        setPermissionGranted(true);
        return stream;
      } catch (err: any) {
        lastError = err;
      }

      setPermissionGranted(false);
      if (lastError?.name === 'NotAllowedError' || lastError?.name === 'SecurityError') {
        permissionDeniedCount++;
        // Invalidate any stale "granted" cache so the next attempt re-prompts cleanly
        globalPermissionGranted = null; writeCachedPerm(false);
        throw new Error(denialHint(isNativeApp));
      }
      if (lastError?.name === 'NotFoundError' || lastError?.name === 'OverconstrainedError') throw new Error('No usable camera was found on this device.');
      if (lastError?.name === 'NotReadableError') throw new Error('Camera is busy. Close other apps/tabs using the camera and try again.');
      if (lastError?.name === 'TimeoutError') throw new Error('Camera stream request timed out. Please try again.');
      throw new Error(lastError?.message || 'Unable to access camera with any settings.');
    })();

    try {
      return await streamRequestInFlight;
    } finally {
      streamRequestInFlight = null;
    }
  }, [requestCameraPermission]);

  const checkPermissionStatus = useCallback(async (): Promise<'granted' | 'denied' | 'prompt'> => {
    // Fast path: already granted in this session (in-memory or persisted)
    if (globalPermissionGranted === true) return 'granted';
    if (readCachedPerm()) {
      globalPermissionGranted = true; writeCachedPerm(true);
      globalMicrophoneGranted = true;
      setPermissionGranted(true);
      return 'granted';
    }

    // Pkg365: On native Android WebView, we prioritize the local cache heavily 
    // because queryPermissionSafe often fails or returns incorrect 'prompt' state.
    if (isNativeApp) {
      const cached = readCachedPerm();
      if (cached) return 'granted';
    }

    // Permissions API works in modern Android WebView (Chromium 70+) and all browsers.
    // It NEVER triggers a permission dialog — safe to call anywhere.
    try {
      const camState = await queryPermissionSafe('camera' as PermissionName);
      const micState = await queryPermissionSafe('microphone' as PermissionName);

      if (camState === 'granted' && (micState === 'granted' || micState === null)) {
        globalPermissionGranted = true; writeCachedPerm(true);
        if (micState === 'granted') globalMicrophoneGranted = true;
        setPermissionGranted(true);
        return 'granted';
      }
      
      // If camState is 'prompt' but we are on native and have NO cache, 
      // we still return 'prompt' to allow the system to ask.
      if (camState === 'denied' || micState === 'denied') {
        setPermissionGranted(false);
        return 'denied';
      }
      return 'prompt';
    } catch {
      return 'prompt';
    }
  }, [isNativeApp]);


  const openSettings = useCallback(async () => {
    if (isNativeApp) {
      try {
        // Try to open Android app settings via Capacitor
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url: 'app-settings:' });
      } catch {
        console.log('[Camera] Open settings manually: Settings > Apps > MeriLive > Permissions');
      }
    }
  }, [isNativeApp]);

  return {
    isRequesting,
    permissionGranted,
    requestCameraPermission,
    getCameraStream,
    checkPermissionStatus,
    openSettings,
    isNativeApp,
  };
}
