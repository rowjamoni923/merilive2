/**
 * NativeCamera — JS bridge to Android CameraX (NativeCameraPlugin.java).
 *
 * Step 1: API surface only. Live + Private Call screens will gradually
 * adopt this in place of getUserMedia(). Web/desktop falls back to null
 * (callers must check `isAvailable()` first).
 */
import { registerPlugin, Capacitor } from '@capacitor/core';

export type CameraLens = 'front' | 'back';
export type CameraResolution = '720p' | '1080p';

export interface NativeCameraPlugin {
  isAvailable(): Promise<{ available: boolean; backend: string; livekit: boolean }>;
  start(opts: { lens?: CameraLens; resolution?: CameraResolution }): Promise<{
    started: boolean;
    lens: CameraLens;
    resolution: CameraResolution;
  }>;
  stop(): Promise<void>;
  switchCamera(): Promise<{ lens: CameraLens }>;
  setTorch(opts: { on: boolean }): Promise<{ on: boolean }>;
}

const Plugin = registerPlugin<NativeCameraPlugin>('NativeCamera');

export const NativeCamera = Plugin;

/** Quick check — true only inside the native Android app with the plugin available. */
export async function isNativeCameraAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (Capacitor.getPlatform() !== 'android') return false;
  try {
    const r = await Plugin.isAvailable();
    return !!r?.available;
  } catch {
    return false;
  }
}

export default NativeCamera;
