/**
 * useBeautyState — REMOVED (Pkg200 prep). Permissive stub.
 *
 * Returns a permissive object so existing 20+ call-sites compile.
 * All operations are no-ops; no UI, no processing.
 */
import { useState, useRef, useCallback } from 'react';
import type { BeautySettings } from '@/components/live/BeautyFilterPanel';
import { DEFAULT_BEAUTY } from '@/components/live/BeautyFilterPanel';
import { isNativeAndroidApp } from '@/utils/nativeUtils';
import { NativeCamera } from '@/plugins/NativeCamera';

export function useBeautyState(): any {
  const [beautyEnabled, setBeautyEnabled] = useState(false);
  const [beautySettings, setBeautySettings] = useState<BeautySettings>({ ...DEFAULT_BEAUTY });
  const [showBeautyPanel, setShowBeautyPanel] = useState(false);
  const [activeSticker, setActiveSticker] = useState<string | null>(null);
  const [stickerActive, setStickerActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const noop = useCallback(() => {}, []);
  const noopAsync = useCallback(async () => {}, []);
  const passthroughAsync = useCallback(async <T,>(x: T): Promise<T> => x, []);

  const handleBeautyEnabledChange = useCallback((v: boolean) => setBeautyEnabled(v), []);
  const handleBeautySettingsChange = useCallback((s: BeautySettings) => setBeautySettings(s), []);
  const handleStickerChange = useCallback((s: string | null) => setActiveSticker(s), []);
  const toggleSticker = useCallback(() => setStickerActive(v => !v), []);
  const openBeautyPanel = useCallback(() => setShowBeautyPanel(true), []);
  const startNativeCamera = useCallback(async () => {
    if (!isNativeAndroidApp()) return false;
    try {
      const lens = facingMode === 'environment' ? 'back' : 'front';
      const result = await NativeCamera.start({ lens, resolution: '1080p' });
      return !!result?.started;
    } catch (error) {
      console.warn('[useBeautyState] NativeCamera.start failed:', error);
      return false;
    }
  }, [facingMode]);
  const stopNativeCamera = useCallback(async () => {
    if (!isNativeAndroidApp()) return;
    try { await NativeCamera.stop(); } catch { /* native optional */ }
  }, []);
  const switchNativeCamera = useCallback(async () => {
    if (!isNativeAndroidApp()) {
      setFacingMode(m => (m === 'user' ? 'environment' : 'user'));
      return;
    }
    try {
      const result = await NativeCamera.switchCamera();
      setFacingMode(result?.lens === 'back' ? 'environment' : 'user');
    } catch (error) {
      console.warn('[useBeautyState] NativeCamera.switchCamera failed:', error);
    }
  }, []);
  const getLastError = useCallback(() => null, []);

  return {
    beautyEnabled,
    setBeautyEnabled,
    beautySettings,
    setBeautySettings,
    showBeautyPanel,
    setShowBeautyPanel,
    activeSticker,
    setActiveSticker,
    stickerActive,
    setStickerActive,
    facingMode,
    canvasRef,
    videoRef,
    isReady: false,
    isNativeAndroid: isNativeAndroidApp(),
    handleBeautyEnabledChange,
    handleBeautySettingsChange,
    handleStickerChange,
    toggleSticker,
    openBeautyPanel,
    switchNativeCamera,
    startNativeCamera,
    stopNativeCamera,
    initBeauty: async () => false,
    destroyBeauty: noop,
    applyToVideoElement: noop,
    applyToTrack: passthroughAsync,
    updateSettings: (s: Partial<BeautySettings>) => setBeautySettings(prev => ({ ...prev, ...s })),
    getLastError,
  };
}

export default useBeautyState;
