/**
 * NativeLiveKit — Capacitor bridge to the minimal Kotlin LiveKitPlugin
 * (2026-06-14 rebuild).
 *
 * Public TS surface is intentionally preserved 1:1 with the previous
 * 1000+ line plugin so the 30+ existing importers (hooks, controllers,
 * gates, components) keep compiling unchanged. Only the implementation
 * is now minimal:
 *
 *   • On Android — calls the new `NativeLiveKit` Capacitor plugin
 *     (LiveKitPlugin.kt, ~240 lines). Camera publish goes through the
 *     LiveKit Android SDK's built-in Camera2 capturer — no ownership
 *     locks, no manual Camera2 handles.
 *   • On Web / iOS — every method resolves harmlessly so the JS
 *     callers fall back to the existing `livekit-client` (web SDK) path.
 *
 * The plugin object is wrapped in a Proxy so any legacy method name
 * (`attachLocal`, `attachRemote`, `setAudioOutputDevice`, etc.) that
 * isn't implemented natively yet still resolves to `undefined` instead
 * of throwing — keeping the app stable while we finish the rebuild.
 */
import { registerPlugin, Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

// ─── Type surface (preserved for existing importers) ──────────────────
export type Lens = 'front' | 'back';
export type Resolution = '480p' | '720p' | '1080p';
export type NativeRoomScope = 'live' | 'call' | 'party';
export type AudioDeviceType =
  | 'earpiece'
  | 'speaker'
  | 'bluetooth'
  | 'wired'
  | 'unknown';

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

export interface ParticipantEvent {
  sid?: string;
  identity?: string;
  metadata?: string;
}

export interface TrackEvent {
  sid?: string;
  identity?: string;
  trackSid?: string;
  kind?: 'audio' | 'video';
  source?: string;
}

export interface DisconnectedEvent { reason?: string }
export interface QualityEvent { sid?: string; quality?: string }
export interface ConnectionStateEvent { state?: string }
export interface AudioInterruptionEvent { reason?: string; resumed?: boolean }

// ─── Plugin interface (only the methods Kotlin actually implements) ──
interface NativeLiveKitPlugin {
  isAvailable(): Promise<{ available: boolean; backend?: string }>;
  connect(opts: ConnectOptions): Promise<{ connected: boolean; sid?: string; identity?: string }>;
  disconnect(): Promise<void>;
  setCameraEnabled(opts: { enabled: boolean }): Promise<{ enabled: boolean }>;
  setMicrophoneEnabled(opts: { enabled: boolean }): Promise<{ enabled: boolean }>;
  switchCamera(): Promise<{ position: Lens }>;
  getCameraOwner(): Promise<{ owner: string | null }>;
  claimCameraForWebView(): Promise<void>;
  releaseCameraForWebView(): Promise<void>;

  // Loose `any` event payload — legacy callers index many ad-hoc fields
  // (sid, identity, kind, state, reason, payloadBase64, isInPip, etc.)
  // that aren't worth typing exhaustively for a transitional shim.
  addListener(
    event: string,
    cb: (e: any) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

const RealPlugin = registerPlugin<NativeLiveKitPlugin>('NativeLiveKit');

/**
 * Proxy wrapper: any property access that isn't on the real plugin
 * returns a safe async no-op. This protects legacy callers that may
 * still invoke method names from the deleted 6252-line plugin.
 */
export const NativeLiveKit: NativeLiveKitPlugin & Record<string, any> =
  new Proxy(RealPlugin as any, {
    get(target, prop: string) {
      const value = (target as any)[prop];
      if (typeof value === 'function') return value.bind(target);
      // Unknown methods → safe async no-op so callers `.then(...)` works.
      return async (..._args: unknown[]) => undefined;
    },
  });

/**
 * Synchronous availability probe used by every gate
 * (`if (isNativeLiveKitAvailable()) ...`). Android native build → true.
 * Web / iOS → false, so callers stay on the web `livekit-client` path.
 */
export function isNativeLiveKitAvailable(): boolean {
  if (!Capacitor.isNativePlatform()) return false;
  return Capacitor.getPlatform() === 'android';
}

export default NativeLiveKit;
