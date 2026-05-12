/**
 * useBeautyLiveKitBridge — Step 21 coordinator.
 *
 * Single hook that flips physical-camera ownership between the LiveKit
 * native publisher and the DeepAR beauty pipeline so they never fight
 * over the Camera2 device.
 *
 * Usage (inside a Live broadcast / private call screen):
 *   const lk = useNativeLiveKit();
 *   const ar = useDeepAR();
 *   const beauty = useBeautyLiveKitBridge(lk, ar);
 *
 *   <Switch checked={beauty.enabled} onChange={beauty.toggle} />
 *
 * Web / iOS: no-op (lk.available === false). Caller can show beauty UI
 * disabled or fall back to the existing tencentBeautyProcessor canvas
 * pipeline used by the web livekit-client path.
 */
import { useCallback, useState } from 'react';
import { NativeLiveKit, isNativeLiveKitAvailable } from '@/plugins/NativeLiveKit';
import type { NativeLiveKitApi } from '@/hooks/useNativeLiveKit';

interface DeepARLike {
  isSupported: boolean;
  isInitialized: boolean;
  initialize: () => Promise<boolean>;
  startCamera: () => Promise<boolean>;
  stopCamera: () => Promise<void>;
}

export interface BeautyLiveKitBridgeApi {
  available: boolean;
  enabled: boolean;
  busy: boolean;
  lastError?: string;
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
  toggle: () => Promise<void>;
}

export function useBeautyLiveKitBridge(
  lk: NativeLiveKitApi,
  ar: DeepARLike,
): BeautyLiveKitBridgeApi {
  const available = isNativeLiveKitAvailable() && ar.isSupported;
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | undefined>();

  const enable = useCallback(async (): Promise<boolean> => {
    if (!available || enabled || busy) return enabled;
    setBusy(true);
    setLastError(undefined);
    try {
      // 1. Tell LiveKit to release the camera.
      await NativeLiveKit.setBeautyPipelineEnabled({ enabled: true });
      // 2. Bring DeepAR online and have it claim the camera.
      if (!ar.isInitialized) await ar.initialize();
      const ok = await ar.startCamera();
      if (!ok) throw new Error('DeepAR.startCamera failed');
      setEnabled(true);
      return true;
    } catch (err: any) {
      // Roll back ownership on failure so LiveKit can resume.
      try { await NativeLiveKit.setBeautyPipelineEnabled({ enabled: false }); } catch { /* ignore */ }
      setLastError(err?.message ?? String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, [available, enabled, busy, ar]);

  const disable = useCallback(async () => {
    if (!available || !enabled || busy) return;
    setBusy(true);
    try {
      await ar.stopCamera();
      await NativeLiveKit.setBeautyPipelineEnabled({ enabled: false });
      setEnabled(false);
    } catch (err: any) {
      setLastError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }, [available, enabled, busy, ar]);

  const toggle = useCallback(async () => {
    if (enabled) await disable(); else await enable();
  }, [enabled, enable, disable]);

  return { available, enabled, busy, lastError, enable, disable, toggle };
}
