/**
 * useNativeAndroidFaceCamera — React hook wrapper for native Face Verification.
 *
 * This hook manages the lifecycle of the native camera on Android, ensuring
 * that the camera is properly released when navigating away or unmounting.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { NativeCamera } from '@/plugins/NativeCamera';
import { useNativeFaceCamera as useSharedNativeFaceCamera } from './useNativeFaceCamera';

export function useNativeAndroidFaceCamera() {
  const shared = useSharedNativeFaceCamera();
  const location = useLocation();
  const [active, setActive] = useState(false);
  const activeRef = useRef(false);

  const startPreview = useCallback(async (resolution: '720p' | '1080p' = '1080p') => {
    // If there's an existing preview, stop it first to reset state
    if (activeRef.current) {
      await shared.stopPreview();
    }
    
    // Ensure all other native cameras are stopped before starting face camera
    // This is the CRITICAL fix for the "Blank Screen" bug where LiveKit
    // or another native instance holds the hardware handle.
    try {
      await NativeCamera.stop();
    } catch (err) {
      console.warn('[useNativeAndroidFaceCamera] NativeCamera.stop failed during init', err);
    }

    const ok = await shared.startPreview(resolution);
    setActive(true);
    activeRef.current = true;
    console.log('[useNativeAndroidFaceCamera] Native face camera started');
    return ok;
  }, [shared]);

  const stopPreview = useCallback(async () => {
    await shared.stopPreview();
    setActive(false);
    activeRef.current = false;
    console.log('[useNativeAndroidFaceCamera] Native face camera stopped');
  }, [shared]);

  // CRITICAL: release camera on navigation or unmount
  useEffect(() => {
    return () => {
      if (activeRef.current) {
        console.log('[useNativeAndroidFaceCamera] Cleaning up native camera on unmount/navigation');
        NativeCamera.stop().catch(() => null);
        activeRef.current = false;
      }
    };
  }, [location.pathname]);

  return {
    ...shared,
    startPreview,
    stopPreview,
    active,
  };
}
