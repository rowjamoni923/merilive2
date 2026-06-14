/**
 * NativeLiveKit — STUB (Step 1 rebuild, 2026-06-14).
 *
 * The old 6252-line LiveKitPlugin has been physically deleted. This file
 * now exposes the same public TS surface as before so the 30+ existing
 * importers keep compiling, but every method is a safe no-op that resolves
 * harmlessly. `isNativeLiveKitAvailable()` returns `false`, so all gated
 * paths fall back to the existing web `livekit-client` flow — Live, Party,
 * Private Call still work via the web SDK while we rebuild the native
 * plugin in subsequent steps.
 */
import type { PluginListenerHandle } from '@capacitor/core';

export type Lens = 'front' | 'back';
export type Resolution = '480p' | '720p' | '1080p';
export type NativeRoomScope = 'live' | 'call' | 'party';
export type AudioDeviceType = 'earpiece' | 'speaker' | 'bluetooth' | 'wired' | 'unknown';

export interface NativeAudioDevice {
  id: string;
  type: AudioDeviceType;
  name?: string;
  selected?: boolean;
}

export interface ConnectOptions {
  url: string;
  token: string;
  lens?: Lens;
  resolution?: Resolution;
  video?: boolean;
  audio?: boolean;
  roomScope?: NativeRoomScope;
  pauseCameraOnBackground?: boolean;
  [k: string]: unknown;
}

export interface ParticipantEvent { sid?: string; identity?: string; metadata?: string; }
export interface TrackEvent { sid?: string; identity?: string; trackSid?: string; kind?: 'audio' | 'video'; source?: string; }
export interface DisconnectedEvent { reason?: string; }
export interface QualityEvent { sid?: string; quality?: string; }
export interface ConnectionStateEvent { state?: string; }
export interface AudioInterruptionEvent { reason?: string; resumed?: boolean; }

function noopHandle(): PluginListenerHandle {
  return { remove: async () => undefined } as PluginListenerHandle;
}

/**
 * Proxy that swallows every method call as a resolved no-op.
 * `addListener` is special-cased to return a removable handle.
 */
export const NativeLiveKit: any = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === 'addListener') {
        return async (_evt: string, _cb: (e: unknown) => void) => noopHandle();
      }
      if (prop === 'removeAllListeners') {
        return async () => undefined;
      }
      if (prop === 'getCameraOwner') {
        return async () => ({ owner: null });
      }
      // Any other plugin method → resolve undefined.
      return async (..._args: unknown[]) => undefined;
    },
  },
);

/** Always false in the stub — keeps every caller on the web fallback path. */
export function isNativeLiveKitAvailable(): boolean {
  return false;
}

export default NativeLiveKit;
