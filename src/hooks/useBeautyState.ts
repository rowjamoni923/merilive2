/**
 * useBeautyState — REAL native beauty driver (Pkg417 — replaces Pkg200 stub).
 *
 * Previously this file was a no-op `useState` stub, so every Beauty button
 * in GoLive / LiveStream / ActiveCallScreen / PartyRoom did absolutely
 * nothing. Beauty only worked while `BeautyFilterPanel` was open (because
 * that component talked to GPUPixel directly). This rewrite makes the
 * shared hook the single source of truth that actually drives the native
 * GPUPixel C++ engine (3D MarsFace landmarks + lipstick → blusher → face
 * reshape → skin beauty pipeline) AND survives track swaps / app
 * foregrounding / re-joins by replaying the last-applied levels on:
 *   - mount
 *   - LiveKit `LocalTrackPublished` (dispatched by all 3 connection hooks)
 *   - `visibilitychange` → visible
 *
 * Web preview stays a visual no-op (the underlying GPUPixel functions
 * already short-circuit on non-Android platforms).
 *
 * API surface is intentionally identical to the old stub so the 20+
 * existing call sites compile unchanged.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import type { BeautySettings } from '@/components/live/BeautyFilterPanel';
import { DEFAULT_BEAUTY } from '@/components/live/BeautyFilterPanel';
import { isNativeAndroidApp } from '@/utils/nativeUtils';
import {
  applyProBeauty,
  applyBroadcastBeauty,
  ensureBeautyInit,
  isBroadcastBeautyEnabled,
  isNativeBeautyAvailable,
  loadStoredLevels,
  persistLevels,
  setBeautyEnabled as setNativeBeautyEnabled,
  type ProBeautyLevels,
} from '@/plugins/GPUPixelBeauty';

const ENABLED_KEY = 'pkg417.beauty.enabled.v1';

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

  // Track last-applied so we can replay on track swap / foreground / re-mount.
  const lastLevelsRef = useRef<ProBeautyLevels>(initialLevels);
  const lastEnabledRef = useRef<boolean>(initialEnabled);

  // ---- Core driver: push (levels, enabled) into the native engine. ----
  const drive = useCallback(async (levels: ProBeautyLevels, enabled: boolean) => {
    if (!isNativeBeautyAvailable()) return;
    try {
      await ensureBeautyInit();
      // Always push slider values (so the engine has fresh state even if
      // currently bypassed — toggling back on is instant).
      await applyProBeauty(levels);
      await setNativeBeautyEnabled(enabled);
      // Push to the LiveKit broadcast track (no-op if no track yet —
      // re-applied on LocalTrackPublished).
      if (isBroadcastBeautyEnabled()) {
        await applyBroadcastBeauty(levels, enabled);
      } else if (!enabled) {
        // Always detach when fully off, regardless of flag.
        await applyBroadcastBeauty(levels, false);
      }
    } catch (err) {
      console.warn('[useBeautyState] drive failed:', err);
    }
  }, []);

  // Apply on mount and whenever levels/enabled change.
  useEffect(() => {
    lastLevelsRef.current = beautySettings.levels ?? initialLevels;
    lastEnabledRef.current = beautyEnabled;
    void drive(lastLevelsRef.current, beautyEnabled);
    // Pkg418: the LiveKit camera track may publish *after* this mount-time
    // drive() runs (LocalTrackPublished fires later) — schedule a few
    // retries so the broadcast processor always picks up our levels even
    // if it wasn't attached on the very first drive.
    const t1 = setTimeout(() => { void drive(lastLevelsRef.current, lastEnabledRef.current); }, 600);
    const t2 = setTimeout(() => { void drive(lastLevelsRef.current, lastEnabledRef.current); }, 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [beautyEnabled, beautySettings.levels, drive]);

  // Replay on track-republish (LiveKit LocalTrackPublished) and foregrounding.
  useEffect(() => {
    if (!isNativeBeautyAvailable()) return;
    const replay = () => { void drive(lastLevelsRef.current, lastEnabledRef.current); };
    const onVisible = () => { if (document.visibilityState === 'visible') replay(); };
    window.addEventListener('beauty:reapply', replay);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('beauty:reapply', replay);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [drive]);

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
    isReady: isNativeBeautyAvailable(),
    isNativeAndroid: isNativeAndroidApp(),
    handleBeautyEnabledChange,
    handleBeautySettingsChange,
    handleStickerChange,
    toggleSticker,
    openBeautyPanel,
    switchNativeCamera,
    startNativeCamera,
    stopNativeCamera,
    initBeauty: async () => {
      if (!isNativeBeautyAvailable()) return false;
      return ensureBeautyInit();
    },
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
