/**
 * useDeepARBeauty — Web-only beauty + sticker hook (DeepAR removed).
 *
 * NOTE: The DeepAR native plugin has been permanently removed from the app
 * per product decision. We now use our own CSS / MediaPipe based beauty
 * pipeline plus the web `StickerOverlay`. The hook name and public API are
 * preserved so existing callers (GoLive, LiveStream, PartyRoom,
 * ActiveCallScreen, UnifiedPartyRoom) keep working without changes.
 *
 * All native-camera methods are now safe no-ops that return `false`, which
 * forces callers to use their existing web camera fallback path.
 */
import { useState, useCallback, useRef } from 'react';
import type { BeautySettings } from '@/components/live/BeautyFilterPanel';
import { isNativeAndroidApp } from '@/utils/nativeUtils';

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
  const [cameraRunning] = useState(false);
  const [facingMode] = useState<'user' | 'environment'>('user');

  const lastErrorRef = useRef<string | null>(null);

  // ===== Camera lifecycle (no-op — web pipeline owns the camera) =====
  const startNativeCamera = useCallback(async (): Promise<boolean> => false, []);
  const stopNativeCamera = useCallback(async () => { /* noop */ }, []);
  const switchNativeCamera = useCallback(async () => { /* noop */ }, []);
  const getLastError = useCallback(() => lastErrorRef.current, []);

  // ===== Beauty / sticker =====
  const ensureDeepARReady = useCallback(async () => false, []);
  const syncBeautyToNative = useCallback(async (_enabled: boolean, _settings: BeautySettings) => {
    /* noop — native bridge removed */
  }, []);

  const openBeautyPanel = useCallback(async () => {
    setShowBeautyPanel(true);
    return true;
  }, []);

  const toggleSticker = useCallback(async () => {
    setStickerActive((prev) => {
      const next = !prev;
      if (!next) setActiveSticker(null);
      return next;
    });
  }, []);

  const handleStickerChange = useCallback((stickerName: string | null) => {
    setActiveSticker(stickerName);
    setStickerActive(!!stickerName);
  }, []);

  const handleBeautySettingsChange = useCallback((settings: BeautySettings) => {
    setBeautySettings(settings);
  }, []);

  const handleBeautyEnabledChange = useCallback((enabled: boolean) => {
    setBeautyEnabled(enabled);
  }, []);

  return {
    // Platform
    isNativeAndroid,

    // Camera lifecycle (native no-ops; callers fall back to web getUserMedia)
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
