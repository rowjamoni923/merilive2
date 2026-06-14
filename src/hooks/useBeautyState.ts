/**
 * useBeautyState — compatibility state only.
 * Camera rebuild 2026-06-14 removed native beauty from production because
 * Live/Party/Private Call must use exactly one LiveKit camera path.
 *
 * API surface is intentionally identical to the old stub so the 20+
 * existing call sites compile unchanged.
 */
import { useState, useRef, useCallback } from 'react';
import type { BeautySettings, ProBeautyLevels } from '@/components/live/BeautyFilterPanel';
import { DEFAULT_BEAUTY, DEFAULT_PRO_BEAUTY } from '@/components/live/BeautyFilterPanel';
import { isNativeAndroidApp } from '@/utils/nativeUtils';

const ENABLED_KEY = 'pkg417.beauty.enabled.v1';
const LEVELS_KEY = 'pkg200.beauty.levels.v1';

function loadStoredLevels(): ProBeautyLevels {
  try { return { ...DEFAULT_PRO_BEAUTY, ...JSON.parse(localStorage.getItem(LEVELS_KEY) || '{}') }; }
  catch { return { ...DEFAULT_PRO_BEAUTY }; }
}

function persistLevels(levels: ProBeautyLevels): void {
  try { localStorage.setItem(LEVELS_KEY, JSON.stringify(levels)); } catch { /* noop */ }
}

function loadStoredEnabled(): boolean {
  try {
    // Default ON on native (host expects professional look out of the box).
    const v = localStorage.getItem(ENABLED_KEY);
    if (v === null) return true;
    return v === '1';
  } catch {
    return true;
  }
}
function persistEnabled(v: boolean): void {
  try { localStorage.setItem(ENABLED_KEY, v ? '1' : '0'); } catch { /* ignore */ }
}

export function useBeautyState(): any {
  const initialLevels = loadStoredLevels();
  const initialEnabled = loadStoredEnabled();

  const [beautyEnabled, setBeautyEnabledState] = useState(initialEnabled);
  const [beautySettings, setBeautySettings] = useState<BeautySettings>({
    ...DEFAULT_BEAUTY,
    levels: initialLevels,
  });
  const [showBeautyPanel, setShowBeautyPanel] = useState(false);
  const [activeSticker, setActiveSticker] = useState<string | null>(null);
  const [stickerActive, setStickerActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleBeautyEnabledChange = useCallback((v: boolean) => {
    setBeautyEnabledState(v);
    persistEnabled(v);
  }, []);
  const handleBeautySettingsChange = useCallback((s: BeautySettings) => {
    setBeautySettings(s);
    if (s.levels) persistLevels(s.levels);
  }, []);
  const handleStickerChange = useCallback((s: string | null) => setActiveSticker(s), []);
  const toggleSticker = useCallback(() => setStickerActive(v => !v), []);
  const openBeautyPanel = useCallback(() => setShowBeautyPanel(true), []);

  // Native CameraX is reserved for face-verify (Pkg416). Streaming surfaces
  // must never open it — Camera2 ownership race → white preview.
  const startNativeCamera = useCallback(async () => false, []);
  const stopNativeCamera = useCallback(async () => {}, []);
  const switchNativeCamera = useCallback(async () => {
    setFacingMode(m => (m === 'user' ? 'environment' : 'user'));
  }, []);
  const getLastError = useCallback(() => null, []);

  return {
    beautyEnabled,
    setBeautyEnabled: handleBeautyEnabledChange,
    beautySettings,
    setBeautySettings: handleBeautySettingsChange,
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
    destroyBeauty: () => {},
    applyToVideoElement: () => {},
    applyToTrack: async <T,>(x: T): Promise<T> => x,
    updateSettings: (s: Partial<BeautySettings>) => {
      setBeautySettings(prev => {
        const next = { ...prev, ...s };
        if (next.levels) persistLevels(next.levels);
        return next;
      });
    },
    getLastError,
  };
}

export default useBeautyState;
