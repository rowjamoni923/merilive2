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
let globalPermissionGranted: boolean | null = null;
let globalMicrophoneGranted: boolean | null = null;
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
const requestCameraViaGetUserMedia = async (includeAudio: boolean): Promise<{ granted: boolean; stream?: MediaStream; error?: string }> => {
  try {
    console.log('[Camera Permission] Requesting via getUserMedia (native WebView path), audio:', includeAudio);
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
    
    if (err.name === 'NotAllowedError') {
      return { granted: false, error: 'Camera permission denied. Enable from Settings > Apps > MeriLive > Permissions.' };
    }
    if (err.name === 'NotFoundError') {
      return { granted: false, error: 'No camera found on this device.' };
    }
    if (err.name === 'NotReadableError') {
      return { granted: false, error: 'Camera is being used by another app.' };
    }
    if (err.name === 'TimeoutError') {
      return { granted: false, error: 'Camera permission timed out. Please try again.' };
    }
    return { granted: false, error: err?.message || 'Camera access failed.' };
  }
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
          const result = await requestCameraViaGetUserMedia(includeMicrophone);
          
          if (result.granted) {
            // Stop the probe stream - actual stream will be requested later
            result.stream?.getTracks().forEach(t => t.stop());
            globalPermissionGranted = true;
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
          return { granted: false, error: 'Camera permission denied in browser settings.' };
        }

        if (cameraState !== 'granted') {
          // Need to request via getUserMedia
          const result = await requestCameraViaGetUserMedia(includeMicrophone);
          if (!result.granted) {
            permissionDeniedCount++;
            setPermissionGranted(false);
            return { granted: false, error: result.error };
          }
          result.stream?.getTracks().forEach(t => t.stop());
        }

        globalPermissionGranted = true;
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
        if (error.name === 'NotAllowedError') errorMessage = 'Camera permission denied. Enable from Settings.';
        else if (error.name === 'NotFoundError') errorMessage = 'No camera found on this device.';
        else if (error.name === 'NotReadableError') errorMessage = 'Camera is being used by another app.';
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

      // Full HD camera — NO aspectRatio constraint to avoid zoom/crop on Android WebView
      // The display layer (CSS object-fit:cover) handles full-screen fill
      const constraintOptions: MediaStreamConstraints[] = [
        {
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: includeAudio,
        },
        {
          video: { facingMode: { ideal: 'user' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
          audio: includeAudio,
        },
        {
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
          audio: includeAudio,
        },
        {
          video: { facingMode: { ideal: 'user' } },
          audio: includeAudio,
        },
        {
          video: true,
          audio: includeAudio,
        },
      ];

      let lastError: any = null;

      for (let i = 0; i < constraintOptions.length; i++) {
        try {
          console.log(`[Camera] Attempt ${i + 1}/${constraintOptions.length}`);
          const stream = await withTimeout(
            navigator.mediaDevices.getUserMedia(constraintOptions[i]),
            7000,
            'Camera stream request timed out'
          );

          const videoTracks = stream.getVideoTracks();
          const hasLiveVideo = videoTracks.some(t => t.readyState === 'live');
          const hasAudioIfNeeded = !includeAudio || stream.getAudioTracks().some(t => t.readyState === 'live');

          if (!hasLiveVideo || !hasAudioIfNeeded) {
            stream.getTracks().forEach(t => t.stop());
            continue;
          }

          // Set contentHint for sharpness
          videoTracks.forEach(vt => {
            try { if ('contentHint' in vt) (vt as any).contentHint = 'detail'; } catch {}
          });

          const settings = videoTracks[0].getSettings();
          console.log('[Camera] Success:', JSON.stringify(settings));

          globalPermissionGranted = true;
          if (includeAudio) globalMicrophoneGranted = true;
          permissionDeniedCount = 0;
          setPermissionGranted(true);

          return stream;
        } catch (err: any) {
          lastError = err;
          console.warn(`[Camera] Attempt ${i + 1} failed:`, err?.name, err?.message);
          continue;
        }
      }

      setPermissionGranted(false);
      if (lastError?.name === 'NotAllowedError') {
        permissionDeniedCount++;
        throw new Error('Camera permission denied. Enable from Settings > Apps > MeriLive > Permissions.');
      }
      if (lastError?.name === 'NotFoundError') throw new Error('No camera found on this device.');
      if (lastError?.name === 'NotReadableError') throw new Error('Camera is being used by another app.');
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
    // Fast path: already granted in this session
    if (globalPermissionGranted === true) return 'granted';

    try {
      if (isNativeApp) {
        // On native Android WebView, Permissions API is unreliable.
        // Do NOT probe via getUserMedia here — that triggers a permission dialog.
        // Return 'prompt' so the UI shows the Allow button instead.
        return 'prompt';
      }

      // Web: use Permissions API (does NOT trigger a dialog)
      const state = await queryPermission('camera' as PermissionName, false);
      if (state === 'granted') {
        globalPermissionGranted = true;
        setPermissionGranted(true);
        return 'granted';
      }
      if (state === 'denied') {
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
