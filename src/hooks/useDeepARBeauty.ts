/**
 * useDeepARBeauty — REMOVED (Pkg200 prep). Permissive stub.
 *
 * Returns a permissive object so existing 20+ call-sites compile.
 * All operations are no-ops; no UI, no processing.
 */
import { useState, useRef, useCallback } from 'react';
import type { BeautySettings } from '@/components/live/BeautyFilterPanel';
import { DEFAULT_BEAUTY } from '@/components/live/BeautyFilterPanel';

export function useDeepARBeauty(): any {
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
  const switchNativeCamera = useCallback(() => {
    setFacingMode(m => (m === 'user' ? 'environment' : 'user'));
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
    isNativeAndroid: false,
    handleBeautyEnabledChange,
    handleBeautySettingsChange,
    handleStickerChange,
    toggleSticker,
    openBeautyPanel,
    switchNativeCamera,
    startNativeCamera: noopAsync,
    stopNativeCamera: noop,
    initBeauty: async () => false,
    destroyBeauty: noop,
    applyToVideoElement: noop,
    applyToTrack: passthroughAsync,
    updateSettings: (s: Partial<BeautySettings>) => setBeautySettings(prev => ({ ...prev, ...s })),
    getLastError,
  };
}

export default useDeepARBeauty;
