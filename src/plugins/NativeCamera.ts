/**
 * NativeCamera — JS bridge to Android CameraX (NativeCameraPlugin.java).
 *
 * Pkg272: extended with capturePhoto / captureFrame / startVideoRecording /
 * stopVideoRecording for native Face Verification flow.
 */
import { registerPlugin, Capacitor } from '@capacitor/core';

export type CameraLens = 'front' | 'back';
export type CameraResolution = '720p' | '1080p';

export interface NativeCameraPlugin {
  isAvailable(): Promise<{
    available: boolean;
    backend: string;
    livekit: boolean;
    photo?: boolean;
    video?: boolean;
  }>;
  start(opts: { lens?: CameraLens; resolution?: CameraResolution }): Promise<{
    started: boolean;
    lens: CameraLens;
    resolution: CameraResolution;
  }>;
  stop(): Promise<void>;
  switchCamera(): Promise<{ lens: CameraLens }>;
  setTorch(opts: { on: boolean }): Promise<{ on: boolean }>;

  capturePhoto(): Promise<{ base64: string; mimeType: string; width: number; height: number }>;
  captureFrame(): Promise<{ base64: string; mimeType: string; width: number; height: number }>;
  startVideoRecording(opts?: { maxDurationMs?: number }): Promise<{ recording: boolean }>;
  stopVideoRecording(): Promise<{
    uri: string;
    base64: string;
    mimeType: string;
    sizeBytes: number;
    durationMs: number;
  }>;
}

const Plugin = registerPlugin<NativeCameraPlugin>('NativeCamera');

export const NativeCamera = Plugin;

/** True only inside the Android app with the native plugin available. */
export async function isNativeCameraAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (Capacitor.getPlatform() !== 'android') return false;
  try {
    const r = await Plugin.isAvailable();
    return !!r?.available && !!r?.video;
  } catch {
    return false;
  }
}

/** Decode a base64 string (no data: prefix) into a Blob of the given mime type. */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const len = byteChars.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export default NativeCamera;
