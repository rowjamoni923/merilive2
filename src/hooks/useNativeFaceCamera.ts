/**
 * useNativeFaceCamera — Pkg272.
 *
 * Adapter around NativeCamera (Android CameraX) shaped for the Face
 * Verification flow. Drop-in for the live-scan + selfie-video steps:
 *
 *   const cam = useNativeFaceCamera();
 *   if (await cam.isAvailable()) {
 *     await cam.startPreview();
 *     const frame = await cam.captureFrame();         // data:image/jpeg;base64,...
 *     await cam.startRecording();
 *     const { blob, durationMs } = await cam.stopRecording();
 *     await cam.stopPreview();
 *   }
 *
 * Web / non-Android falls through silently — caller keeps existing
 * getUserMedia + MediaRecorder path.
 */
import { useCallback, useRef } from 'react';
import { NativeCamera, isNativeCameraAvailable, base64ToBlob } from '@/plugins/NativeCamera';

export function useNativeFaceCamera() {
  const previewActiveRef = useRef(false);
  const recordingActiveRef = useRef(false);

  const isAvailable = useCallback(async () => {
    return isNativeCameraAvailable();
  }, []);

  const startPreview = useCallback(async (resolution: '720p' | '1080p' = '1080p') => {
    if (previewActiveRef.current) return;
    await NativeCamera.start({ lens: 'front', resolution });
    previewActiveRef.current = true;
  }, []);

  const stopPreview = useCallback(async () => {
    if (recordingActiveRef.current) {
      try { await NativeCamera.stopVideoRecording(); } catch { /* noop */ }
      recordingActiveRef.current = false;
    }
    if (!previewActiveRef.current) return;
    try { await NativeCamera.stop(); } catch { /* noop */ }
    previewActiveRef.current = false;
  }, []);

  /** Returns a `data:image/jpeg;base64,...` URL — drop-in for canvas/toDataURL. */
  const captureFrame = useCallback(async (): Promise<string | null> => {
    try {
      const r = await NativeCamera.captureFrame();
      return `data:${r.mimeType};base64,${r.base64}`;
    } catch (e) {
      console.warn('[useNativeFaceCamera] captureFrame failed', e);
      return null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (recordingActiveRef.current) return;
    await NativeCamera.startVideoRecording({ maxDurationMs: 60000 });
    recordingActiveRef.current = true;
  }, []);

  const stopRecording = useCallback(async (): Promise<{ blob: Blob; durationMs: number; sizeBytes: number } | null> => {
    if (!recordingActiveRef.current) return null;
    try {
      const r = await NativeCamera.stopVideoRecording();
      recordingActiveRef.current = false;
      const blob = base64ToBlob(r.base64, r.mimeType || 'video/mp4');
      return { blob, durationMs: r.durationMs, sizeBytes: r.sizeBytes };
    } catch (e) {
      console.error('[useNativeFaceCamera] stopRecording failed', e);
      recordingActiveRef.current = false;
      return null;
    }
  }, []);

  return {
    isAvailable,
    startPreview,
    stopPreview,
    captureFrame,
    startRecording,
    stopRecording,
  };
}

export default useNativeFaceCamera;
