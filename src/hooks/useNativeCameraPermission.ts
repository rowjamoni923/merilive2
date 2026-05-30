import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { isNativeApp as detectNativeApp } from '@/utils/nativeUtils';

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
 * On Android WebView, navigator.permissions.query may not work for camera/mic.
 * We skip it on native and go straight to getUserMedia probe.
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
 * The CORE fix: On native Android WebView, we MUST use getUserMedia directly.
 * @capacitor/camera plugin only handles photo/gallery permissions, NOT WebRTC.
 * The native WebChromeClient.onPermissionRequest() handles the actual Android permission dialog.
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
    const stream = await withTimeout(
      navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' }, 
        audio: includeAudio 
      }),
      10000, // 10s timeout for native permission dialog
      'Camera permission request timed out'
    );
    
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
    { video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio },
    { video: { facingMode: { ideal: facingMode }, width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24 } }, audio },
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
      const videoTracks = stream.getVideoTracks();
      const hasLiveVideo = videoTracks.some((track) => track.readyState === 'live');
      if (!hasLiveVideo) {
        stream.getTracks().forEach((track) => track.stop());
        continue;
      }
      videoTracks.forEach((track) => {
        try { if ('contentHint' in track) (track as any).contentHint = 'motion'; } catch {}
      });
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
 * KEY FIX for Play Store WebView:
 * - On native Android, we SKIP @capacitor/camera plugin entirely for WebRTC
 * - We go straight to getUserMedia which triggers WebChromeClient.onPermissionRequest()
 * - This is the ONLY reliable way to get camera/mic in Android WebView
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
    if (globalPermissionGranted === true && (!includeMicrophone || globalMicrophoneGranted === true)) {
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
          // ===== NATIVE ANDROID: Direct getUserMedia (the ONLY reliable method) =====
          // @capacitor/camera is for photo capture, NOT for WebRTC getUserMedia.
          // The native WebChromeClient.onPermissionRequest() handles the Android permission dialog.
          const result = await requestCameraViaGetUserMedia(includeMicrophone, true);
          
          if (result.granted) {
            // Stop the probe stream - actual stream will be requested later
            result.stream?.getTracks().forEach(t => t.stop());
            globalPermissionGranted = true; writeCachedPerm(true);
            if (includeMicrophone) globalMicrophoneGranted = true;
            permissionDeniedCount = 0;
            setPermissionGranted(true);
            return { granted: true, microphoneGranted: includeMicrophone ? true : undefined };
          } else {
            permissionDeniedCount++;
            setPermissionGranted(false);
            return { granted: false, error: result.error };
          }
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
