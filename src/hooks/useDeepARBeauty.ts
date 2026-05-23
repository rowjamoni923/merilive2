/**
 * useDeepARBeauty — REMOVED (Pkg200 prep). Stub only.
 */
import { useState, useRef } from 'react';
import type { BeautySettings } from '@/components/live/BeautyFilterPanel';
import { DEFAULT_BEAUTY } from '@/components/live/BeautyFilterPanel';

export function useDeepARBeauty() {
  const [beautyEnabled, setBeautyEnabled] = useState(false);
  const [beautySettings, setBeautySettings] = useState<BeautySettings>({ ...DEFAULT_BEAUTY });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const initBeauty = async () => false;
  const destroyBeauty = () => {};
  const applyToVideoElement = (_el: HTMLVideoElement | null) => {};
  const applyToTrack = async <T,>(track: T): Promise<T> => track;
  const updateSettings = (s: Partial<BeautySettings>) => {
    setBeautySettings(prev => ({ ...prev, ...s }));
  };

  return {
    beautyEnabled,
    setBeautyEnabled,
    beautySettings,
    setBeautySettings,
    updateSettings,
    canvasRef,
    videoRef,
    initBeauty,
    destroyBeauty,
    applyToVideoElement,
    applyToTrack,
    isReady: false,
  };
}

export default useDeepARBeauty;
