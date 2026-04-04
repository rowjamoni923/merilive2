import { useState, useCallback, useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

// ============================================================
// MeriLive DeepAR Native Camera + Beauty Hook
// ============================================================
// এটি সম্পূর্ণ NATIVE camera system control করে।
// WebView camera ব্যবহার করে না — সরাসরি Android Camera2 API।
// ============================================================

interface DeepARPlugin {
  initialize(): Promise<{ success: boolean; message: string }>;
  startCamera(): Promise<{ success: boolean; message: string }>;
  stopCamera(): Promise<{ success: boolean; message: string }>;
  switchCamera(): Promise<{ success: boolean; isFrontCamera: boolean }>;
  switchEffect(options: { effectPath: string; slot?: string }): Promise<{ success: boolean }>;
  setBeautyParam(options: { param: string; value: number }): Promise<{ success: boolean }>;
  applyBeautyPreset(options: { preset: string }): Promise<{ success: boolean }>;
  clearEffect(): Promise<{ success: boolean }>;
  showNativeSurface(): Promise<{ success: boolean }>;
  hideNativeSurface(): Promise<{ success: boolean }>;
  takeScreenshot(): Promise<{ success: boolean }>;
  getState(): Promise<DeepARState>;
  pause(): Promise<{ success: boolean }>;
  resume(): Promise<{ success: boolean }>;
  destroy(): Promise<{ success: boolean }>;
  addListener(event: string, callback: (data: Record<string, unknown>) => void): Promise<{ remove: () => void }>;
}

interface DeepARState {
  isInitialized: boolean;
  isCameraRunning: boolean;
  isFrontCamera: boolean;
  isPaused: boolean;
  resolution: string;
  smoothness: number;
  whitening: number;
  redness: number;
  eyeEnlarge: number;
  faceSlim: number;
  chinSlim: number;
  noseNarrow: number;
  lipColor: number;
}

export type BeautyParam = 
  | 'smoothness' | 'whitening' | 'redness' | 'eyeEnlarge'
  | 'faceSlim' | 'chinSlim' | 'noseNarrow' | 'lipColor';

export type BeautyPreset = 
  | 'none' | 'natural' | 'glamour' | 'cute' 
  | 'celebrity' | 'soft' | 'bold' | 'flawless';

const isDeepARPluginRegistered = (): boolean => {
  try {
    if (!Capacitor.isNativePlatform()) return false;
    const plugins = (window as any)?.Capacitor?.Plugins;
    if (plugins && typeof plugins.DeepAR !== 'undefined') return true;
    const registeredPlugins = (window as any)?.Capacitor?.registeredPlugins;
    if (registeredPlugins?.has?.('DeepAR')) return true;
    return false;
  } catch {
    return false;
  }
};

const DeepAR = (Capacitor.isNativePlatform() && isDeepARPluginRegistered())
  ? registerPlugin<DeepARPlugin>('DeepAR') 
  : null;

export function useDeepAR() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isCameraRunning, setIsCameraRunning] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [faceVisible, setFaceVisible] = useState(false);
  const isSupported = Capacitor.isNativePlatform();

  // Initialize DeepAR native engine
  const initialize = useCallback(async () => {
    if (!DeepAR || !isSupported) {
      console.log('[DeepAR] Not supported — web platform');
      return false;
    }

    try {
      setIsLoading(true);
      await DeepAR.initialize();
      setIsInitialized(true);
      console.log('[DeepAR] ✅ Native engine initialized');
      return true;
    } catch (err) {
      console.error('[DeepAR] ❌ Init failed:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  // Start native camera (Camera2 API — not WebView)
  const startCamera = useCallback(async () => {
    if (!DeepAR || !isInitialized) return false;
    try {
      await DeepAR.startCamera();
      await DeepAR.showNativeSurface();
      setIsCameraRunning(true);
      console.log('[DeepAR] ✅ Native camera started — 1080p HD');
      return true;
    } catch (err) {
      console.error('[DeepAR] ❌ Camera start failed:', err);
      return false;
    }
  }, [isInitialized]);

  // Stop native camera
  const stopCamera = useCallback(async () => {
    if (!DeepAR || !isInitialized) return;
    try {
      await DeepAR.stopCamera();
      await DeepAR.hideNativeSurface();
      setIsCameraRunning(false);
    } catch (err) {
      console.error('[DeepAR] Stop camera failed:', err);
    }
  }, [isInitialized]);

  // Set individual beauty parameter (0.0 - 1.0)
  const setBeautyParam = useCallback(async (param: BeautyParam, value: number) => {
    if (!DeepAR || !isInitialized) return;
    try {
      await DeepAR.setBeautyParam({ param, value: Math.max(0, Math.min(1, value)) });
    } catch (err) {
      console.error('[DeepAR] Set param failed:', err);
    }
  }, [isInitialized]);

  // Apply beauty preset
  const applyPreset = useCallback(async (preset: BeautyPreset) => {
    if (!DeepAR || !isInitialized) return;
    try {
      await DeepAR.applyBeautyPreset({ preset });
      console.log('[DeepAR] 🎨 Preset:', preset);
    } catch (err) {
      console.error('[DeepAR] Preset failed:', err);
    }
  }, [isInitialized]);

  // Switch AR effect/filter
  const switchEffect = useCallback(async (effectPath: string, slot = 'effect') => {
    if (!DeepAR || !isInitialized) return;
    try {
      await DeepAR.switchEffect({ effectPath, slot });
    } catch (err) {
      console.error('[DeepAR] Effect switch failed:', err);
    }
  }, [isInitialized]);

  // Clear all effects
  const clearEffect = useCallback(async () => {
    if (!DeepAR || !isInitialized) return;
    try {
      await DeepAR.clearEffect();
    } catch (err) {
      console.error('[DeepAR] Clear failed:', err);
    }
  }, [isInitialized]);

  // Toggle front/back camera
  const toggleCamera = useCallback(async () => {
    if (!DeepAR || !isInitialized) return;
    try {
      const result = await DeepAR.switchCamera();
      setIsFrontCamera(result.isFrontCamera);
    } catch (err) {
      console.error('[DeepAR] Switch camera failed:', err);
    }
  }, [isInitialized]);

  // Take screenshot (DeepAR processed)
  const takeScreenshot = useCallback(async () => {
    if (!DeepAR || !isInitialized) return;
    try {
      await DeepAR.takeScreenshot();
    } catch (err) {
      console.error('[DeepAR] Screenshot failed:', err);
    }
  }, [isInitialized]);

  // Full cleanup
  const destroy = useCallback(async () => {
    if (!DeepAR) return;
    try {
      await DeepAR.destroy();
      setIsInitialized(false);
      setIsCameraRunning(false);
      console.log('[DeepAR] 🧹 Destroyed');
    } catch (err) {
      console.error('[DeepAR] Destroy failed:', err);
    }
  }, []);

  // Listen for native events
  useEffect(() => {
    if (!DeepAR || !isSupported) return;

    const listeners: Array<{ remove: () => void }> = [];

    DeepAR.addListener('faceVisibilityChanged', (data) => {
      setFaceVisible(data.faceVisible as boolean);
    }).then(handle => listeners.push(handle));

    DeepAR.addListener('error', (data) => {
      console.error('[DeepAR] Native error:', data.message);
    }).then(handle => listeners.push(handle));

    return () => {
      listeners.forEach(l => l.remove());
    };
  }, [isSupported]);

  return {
    isSupported,
    isInitialized,
    isCameraRunning,
    isLoading,
    isFrontCamera,
    faceVisible,
    initialize,
    startCamera,
    stopCamera,
    setBeautyParam,
    applyPreset,
    switchEffect,
    clearEffect,
    toggleCamera,
    takeScreenshot,
    destroy,
  };
}
