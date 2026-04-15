/**
 * useDeepARBeauty — Unified DeepAR native camera + beauty hook
 * 
 * ONE camera system for ALL features:
 * - Go Live (preview)
 * - Live Stream (host broadcasting)
 * - Party Room
 * - Private Call (ActiveCallScreen)
 * 
 * This manages: camera lifecycle, beauty params, stickers, camera switch
 */
import { useState, useCallback, useRef } from 'react';
import { registerPlugin } from '@capacitor/core';
import type { BeautySettings } from '@/components/live/BeautyFilterPanel';
import { isNativeAndroidApp } from '@/utils/nativeUtils';

// ===== DeepAR Native Plugin =====
interface DeepARNativePlugin {
  initialize(): Promise<{ success: boolean; message: string }>;
  startCamera(): Promise<{ success: boolean; message: string }>;
  stopCamera(): Promise<{ success: boolean; message: string }>;
  switchCamera(): Promise<{ success: boolean; isFrontCamera: boolean }>;
  showNativeSurface(): Promise<{ success: boolean }>;
  hideNativeSurface(): Promise<{ success: boolean }>;
  setBeautyParam(options: { param: string; value: number }): Promise<{ success: boolean }>;
  applyBeautyPreset(options: { preset: string }): Promise<{ success: boolean }>;
  switchEffect(options: { effectPath: string; slot?: string }): Promise<{ success: boolean }>;
  clearEffect(): Promise<{ success: boolean }>;
  takeScreenshot(): Promise<{ success: boolean }>;
  getState(): Promise<DeepARNativeState>;
  resume?(): Promise<{ success: boolean }>;
  destroy(): Promise<{ success: boolean }>;
}

interface DeepARNativeState {
  isInitialized: boolean;
  isCameraRunning: boolean;
  isCaptureSessionConfigured?: boolean;
  isBeautyEffectLoaded?: boolean;
  isFrontCamera: boolean;
  isPaused: boolean;
  resolution: string;
  totalFrames?: number;
  droppedFrames?: number;
}

// Lazy-init: only register if native plugin truly exists
let DeepARBridge: DeepARNativePlugin | null = null;
let deepARPluginChecked = false;
let deepARPluginAvailable = false;

/**
 * Check if the DeepAR native plugin is actually available (registered in native layer).
 * registerPlugin() always returns a proxy — so we CANNOT rely on Capacitor.Plugins.DeepAR
 * being defined. Instead, we do a single probe call and cache the result.
 */
const isDeepARPluginAvailable = (): boolean => {
  if (deepARPluginChecked) return deepARPluginAvailable;
  try {
    if (typeof (window as any)?.Capacitor?.isNativePlatform !== 'function') return false;
    if (!(window as any).Capacitor.isNativePlatform()) return false;
    // Check the REAL native bridge registry — not the JS proxy
    const cap = (window as any).Capacitor;
    // Capacitor 5+ stores registered native plugins in CapacitorCustomPlatform or native bridge
    // The only reliable check: see if the native bridge has the plugin handler
    const nativeBridge = cap?.PluginHeaders;
    if (Array.isArray(nativeBridge)) {
      deepARPluginChecked = true;
      deepARPluginAvailable = nativeBridge.some((h: any) => h?.name === 'DeepAR');
      if (deepARPluginAvailable) {
        DeepARBridge = registerPlugin<DeepARNativePlugin>('DeepAR');
      }
      return deepARPluginAvailable;
    }
    // Fallback: not available
    deepARPluginChecked = true;
    deepARPluginAvailable = false;
    return false;
  } catch {
    deepARPluginChecked = true;
    deepARPluginAvailable = false;
    return false;
  }
};

const isUnimplementedNativeError = (error: unknown) => {
  const text = String((error as any)?.message ?? (error as any)?.code ?? error ?? '').toLowerCase();
  return text.includes('unimplemented') || text.includes('not implemented') || text.includes('plugin') || text.includes('not available') || text.includes('does not respond');
};

const DEFAULT_BEAUTY: BeautySettings = {
  smoothness: 35, whitening: 20, redness: 10, sharpness: 15,
  glow: 10, warmth: 10, eyeBright: 15, skinTone: 55,
  faceSlim: 15, chinSlim: 10, eyeEnlarge: 10, noseNarrow: 5, lipColor: 10,
};

export function useDeepARBeauty() {
  const isNativeAndroid = isNativeAndroidApp();
  const [showBeautyPanel, setShowBeautyPanel] = useState(false);
  const [stickerActive, setStickerActive] = useState(false);
  const [activeSticker, setActiveSticker] = useState<string | null>(null);
  const [beautyEnabled, setBeautyEnabled] = useState(true);
  const [beautySettings, setBeautySettings] = useState<BeautySettings>({ ...DEFAULT_BEAUTY });
  const [cameraRunning, setCameraRunning] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  // Only enable if native AND the plugin truly exists
  const [nativeDeepAREnabled, setNativeDeepAREnabled] = useState<boolean>(
    isNativeAndroid && isDeepARPluginAvailable()
  );

  const deepArReadyRef = useRef(false);
  const deepArInitInFlightRef = useRef(false);
  const cameraStartInFlightRef = useRef(false);
  const beautySyncInFlightRef = useRef(false);
  const queuedBeautySyncRef = useRef<{ enabled: boolean; settings: BeautySettings } | null>(null);
  const lastErrorRef = useRef<string | null>(null);
  const nativeUnavailableRef = useRef(false);

  const disableNativeDeepAR = useCallback((error: unknown) => {
    if (!nativeUnavailableRef.current) {
      console.warn('[DeepARBeauty] Native bridge unavailable, falling back to web camera:', error);
    }
    nativeUnavailableRef.current = true;
    deepArReadyRef.current = false;
    setNativeDeepAREnabled(false);
    const message = String((error as any)?.message ?? (error as any)?.code ?? error ?? 'DeepAR native bridge unavailable');
    lastErrorRef.current = message;
  }, []);

  // ========== ENGINE INIT ==========
  const ensureDeepARReady = useCallback(async () => {
    if (!nativeDeepAREnabled || !DeepARBridge || nativeUnavailableRef.current) return false;
    if (!isDeepARPluginAvailable()) {
      console.log('[DeepARBeauty] DeepAR native plugin not registered, disabling');
      nativeUnavailableRef.current = true;
      setNativeDeepAREnabled(false);
      return false;
    }
    if (deepArReadyRef.current) return true;
    if (deepArInitInFlightRef.current) return false;

    deepArInitInFlightRef.current = true;
    try {
      await DeepARBridge.initialize();
      deepArReadyRef.current = true;
      return true;
    } catch (error) {
      console.error("[DeepARBeauty] Initialize failed:", error);
      if (isUnimplementedNativeError(error)) disableNativeDeepAR(error);
      return false;
    } finally {
      deepArInitInFlightRef.current = false;
    }
  }, [nativeDeepAREnabled, disableNativeDeepAR]);

  // ========== BEAUTY SYNC ==========
  const normalize = (v: number) => Math.max(0, Math.min(1, v / 100));

  const syncBeautyToNative = useCallback(async (enabled: boolean, settings: BeautySettings) => {
    if (!isNativeAndroid || !DeepARBridge) return;

    queuedBeautySyncRef.current = { enabled, settings: { ...settings } };
    if (beautySyncInFlightRef.current) return;

    beautySyncInFlightRef.current = true;
    try {
      while (queuedBeautySyncRef.current) {
        const nextSync = queuedBeautySyncRef.current;
        queuedBeautySyncRef.current = null;

        const ready = await ensureDeepARReady();
        if (!ready) continue;

        try {
          if (!nextSync.enabled) {
            await DeepARBridge.applyBeautyPreset({ preset: "none" });
            continue;
          }

          const mappings: Array<[string, number]> = [
            ["smoothness", nextSync.settings.smoothness],
            ["whitening", nextSync.settings.whitening],
            ["redness", nextSync.settings.redness],
            ["eyeEnlarge", nextSync.settings.eyeEnlarge],
            ["faceSlim", nextSync.settings.faceSlim],
            ["chinSlim", nextSync.settings.chinSlim],
            ["noseNarrow", nextSync.settings.noseNarrow],
            ["lipColor", nextSync.settings.lipColor],
          ];

          for (const [param, value] of mappings) {
            await DeepARBridge.setBeautyParam({ param, value: normalize(value) });
          }
        } catch (error) {
          console.error("[DeepARBeauty] Sync failed:", error);
        }
      }
    } finally {
      beautySyncInFlightRef.current = false;
    }
  }, [ensureDeepARReady]);

  // ========== CAMERA LIFECYCLE ==========
  
  /** Wait for native camera to produce real frames */
  const waitForCameraFrames = useCallback(async (timeoutMs: number) => {
    if (!DeepARBridge) throw new Error('No bridge');
    
    const startedAt = Date.now();
    let resumeAttempted = false;
    let lastState: DeepARNativeState | null = null;

    while (Date.now() - startedAt < timeoutMs) {
      try {
        const nativeState = await DeepARBridge.getState();
        lastState = nativeState;

        const isRunning = Boolean(nativeState?.isCameraRunning);
        const isConfigured = Boolean(nativeState?.isCaptureSessionConfigured ?? isRunning);
        const isPaused = Boolean(nativeState?.isPaused);
        const elapsedMs = Date.now() - startedAt;

        const hasFrameCounter = typeof nativeState?.totalFrames === 'number' && Number.isFinite(nativeState.totalFrames);
        const totalFrames = hasFrameCounter ? Number(nativeState?.totalFrames ?? 0) : null;

        // ✅ Keep strict frame check, but fail fast if counter stays zero too long.
        if (isRunning && isConfigured && !isPaused) {
          if (hasFrameCounter) {
            if ((totalFrames ?? 0) > 0) {
              return nativeState;
            }

            if (elapsedMs >= 5000) {
              console.warn('[DeepARBeauty] Frame counter stuck at 0 after 5s, accepting running session');
              return nativeState;
            }
          } else if (elapsedMs >= 1200) {
            return nativeState;
          }
        }
      } catch {
        // ignore getState failures during startup
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const details = lastState
      ? `running=${Boolean(lastState.isCameraRunning)}, configured=${Boolean(lastState.isCaptureSessionConfigured)}, paused=${Boolean(lastState.isPaused)}, frames=${Number(lastState.totalFrames ?? 0)}`
      : 'no-state';
    throw new Error(`Native camera frame timeout (${details})`);
  }, []);

  /** Internal: one start attempt */
  const startOnce = useCallback(async (timeoutMs: number) => {
    if (!DeepARBridge) throw new Error('No bridge');
    
    if (typeof DeepARBridge.resume === 'function') {
      try { await DeepARBridge.resume(); } catch { /* ignore */ }
    }
    await new Promise((resolve) => setTimeout(resolve, 180));
    await DeepARBridge.startCamera();
    await waitForCameraFrames(timeoutMs);
  }, [waitForCameraFrames]);

  /** Internal: cleanup after failed start */
  const cleanupNativeStart = useCallback(async () => {
    if (!DeepARBridge) return;
    try {
      await DeepARBridge.stopCamera();
      await DeepARBridge.hideNativeSurface();
    } catch { /* ignore */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }, []);

  /**
   * Start native DeepAR camera with retry logic.
   * Call from GoLive, LiveStream, PartyRoom, or ActiveCallScreen.
   * Returns true if camera started successfully.
   */
  const startNativeCamera = useCallback(async (): Promise<boolean> => {
    if (!isNativeAndroid || !DeepARBridge) return false;
    if (cameraStartInFlightRef.current) return false;

    cameraStartInFlightRef.current = true;
    lastErrorRef.current = null;

    try {
      try {
        const state = await DeepARBridge.getState();
        if (state?.isCameraRunning && Number(state?.totalFrames ?? 0) > 0) {
          setCameraRunning(true);
          setFacingMode(state.isFrontCamera ? 'user' : 'environment');
          return true;
        }
      } catch {
        // ignore state read failure
      }

      const ready = await ensureDeepARReady();
      if (!ready) {
        lastErrorRef.current = "DeepAR failed to initialize";
        return false;
      }

      const MAX_ATTEMPTS = 3;
      let lastError: any = null;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          console.log(`[DeepARBeauty] Camera start attempt ${attempt}/${MAX_ATTEMPTS}`);
          const timeout = attempt === 1 ? 4000 : attempt === 2 ? 6000 : 8000;
          await startOnce(timeout);
          lastError = null;
          break;
        } catch (attemptError: any) {
          lastError = attemptError;
          const msg = String(attemptError?.message || attemptError || 'start failed');
          console.warn(`[DeepARBeauty] Attempt ${attempt} failed: ${msg}`);

          if (attempt < MAX_ATTEMPTS) {
            await cleanupNativeStart();

            if (/frame timeout|no capture/i.test(msg)) {
              try { await DeepARBridge.destroy(); } catch { /* ignore */ }
              deepArReadyRef.current = false;
              deepArInitInFlightRef.current = false;
              await new Promise((resolve) => setTimeout(resolve, 500));
              await ensureDeepARReady();
            }
          }
        }
      }

      if (lastError) throw lastError;

      try {
        await syncBeautyToNative(beautyEnabled, beautySettings);
      } catch (beautyError) {
        console.warn('[DeepARBeauty] Startup beauty apply warning:', beautyError);
      }

      setCameraRunning(true);
      setFacingMode('user');
      return true;
    } catch (error: any) {
      const message = String(error?.message || error || 'Unknown DeepAR start error');
      lastErrorRef.current = message;
      console.error("[DeepARBeauty] Camera start failed after all attempts:", message);
      // If native bridge is fundamentally broken, disable it permanently
      if (isUnimplementedNativeError(error)) {
        disableNativeDeepAR(error);
      }
      setCameraRunning(false);
      await cleanupNativeStart().catch(() => {});
      return false;
    } finally {
      cameraStartInFlightRef.current = false;
    }
  }, [ensureDeepARReady, startOnce, cleanupNativeStart, syncBeautyToNative, beautyEnabled, beautySettings]);

  /** Stop native DeepAR camera */
  const stopNativeCamera = useCallback(async () => {
    if (!isNativeAndroid || !DeepARBridge) return;

    try {
      await DeepARBridge.stopCamera();
      await DeepARBridge.hideNativeSurface();
    } catch (error) {
      console.warn('[DeepARBeauty] Camera stop warning:', error);
    } finally {
      setCameraRunning(false);
    }
  }, []);

  /** Switch front/back camera */
  const switchNativeCamera = useCallback(async () => {
    if (!isNativeAndroid || !DeepARBridge || !cameraRunning) return;

    try {
      const result = await DeepARBridge.switchCamera();
      const isFront = result?.isFrontCamera ?? facingMode !== 'user';
      setFacingMode(isFront ? 'user' : 'environment');
    } catch (error) {
      console.error('[DeepARBeauty] Camera switch failed:', error);
    }
  }, [cameraRunning, facingMode]);

  /** Get last error message */
  const getLastError = useCallback(() => lastErrorRef.current, []);

  // ========== BEAUTY & STICKER ==========
  const openBeautyPanel = useCallback(async () => {
    if (!isNativeAndroid) return false;
    const ready = await ensureDeepARReady();
    if (!ready) return false;
    setShowBeautyPanel(true);
    return true;
  }, [ensureDeepARReady]);

  const toggleSticker = useCallback(async () => {
    if (!isNativeAndroid || !DeepARBridge) return;
    const ready = await ensureDeepARReady();
    if (!ready) return;

    const next = !stickerActive;
    setStickerActive(next);

    try {
      if (next) {
        await DeepARBridge.switchEffect({ effectPath: "sticker", slot: "effect" });
      } else {
        await DeepARBridge.switchEffect({ effectPath: "", slot: "effect" });
      }
    } catch (error) {
      setStickerActive(!next);
      console.error("[DeepARBeauty] Sticker toggle failed:", error);
    }
  }, [stickerActive, ensureDeepARReady]);

  const handleStickerChange = useCallback((stickerName: string | null) => {
    setActiveSticker(stickerName);
    setStickerActive(!!stickerName);
  }, []);

  const handleBeautySettingsChange = useCallback((settings: BeautySettings) => {
    setBeautySettings(settings);
    if (isNativeAndroid) {
      void syncBeautyToNative(beautyEnabled, settings);
    }
  }, [beautyEnabled, syncBeautyToNative]);

  const handleBeautyEnabledChange = useCallback((enabled: boolean) => {
    setBeautyEnabled(enabled);
    if (isNativeAndroid) {
      void syncBeautyToNative(enabled, beautySettings);
    }
  }, [beautySettings, syncBeautyToNative]);

  return {
    // Platform
    isNativeAndroid,
    
    // Camera lifecycle
    cameraRunning,
    facingMode,
    startNativeCamera,
    stopNativeCamera,
    switchNativeCamera,
    getLastError,
    
    // Beauty
    showBeautyPanel,
    setShowBeautyPanel,
    stickerActive,
    activeSticker,
    beautyEnabled,
    beautySettings,
    openBeautyPanel,
    toggleSticker,
    handleStickerChange,
    handleBeautySettingsChange,
    handleBeautyEnabledChange,
    syncBeautyToNative,
    ensureDeepARReady,
  };
}
