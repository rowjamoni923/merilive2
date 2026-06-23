/**
 * useNativeAndroidFaceCamera — React hook wrapper for native Face Verification.
 *
 * This hook manages the lifecycle of the native camera on Android, ensuring
 * that the camera is properly released when navigating away or unmounting.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { NativeCamera } from '@/plugins/NativeCamera';
import { ProCameraEngine } from '@/camera/ProCameraEngine';
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
    
    if (ProCameraEngine.currentFamily() === 'streaming') {
      throw new Error('Camera busy — Please end your live, party, or call session before verifying your face.');
    }
    // Stop only a previous FaceVerification CameraX preview. Never evict
    // LiveKit/party/call here; ProCameraEngine owns that conflict decision.
    await NativeCamera.stop().catch(() => undefined);

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

  // BUG-11 fix: release camera on BOTH unmount AND route change.
  // Previously only route change fired cleanup, so modal-close / strict-mode
  // double-mount / app background never released the camera → next attempt
  // hit "camera in use" and silently failed permission.
  useEffect(() => {
    return () => {
      if (activeRef.current) {
        console.log('[useNativeAndroidFaceCamera] Cleanup on unmount');
        NativeCamera.stop().catch(() => null);
        activeRef.current = false;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (activeRef.current) {
        console.log('[useNativeAndroidFaceCamera] Cleanup on route change');
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
