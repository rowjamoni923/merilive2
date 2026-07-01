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
  /** Locked publish quality — passed straight to LiveKitPlugin.kt. Defaults
   * to the LOCK_* constants in Kotlin (natural 3:4 capture, 30fps base, 3-layer
   * simulcast). Anti-blur contract: SDK / SFU MUST NOT down-tune the base
   * encoding at runtime — adaptation happens viewer-side (simulcast layer
   * switch) only. */
  captureWidth?: number;
  captureHeight?: number;
  captureFps?: number;
  maxBitrate?: number;
  maxFps?: number;
  simulcast?: boolean;
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
  isAvailable(): Promise<{
    available: boolean;
    backend?: string;
    supportsPreview?: boolean;
    /** Phase 4 — list of natively implemented method names. */
    methods?: string[];
  }>;
  startLocalPreview(opts: {
    lens?: Lens;
    resolution?: Resolution;
    mirror?: boolean;
    boundedOnly?: boolean;
    roomScope?: NativeRoomScope;
  }): Promise<{ started: boolean; reused?: boolean }>;
  stopLocalPreview(): Promise<{ stopped: boolean; reason?: string }>;
  connect(opts: ConnectOptions): Promise<{ connected: boolean; sid?: string; identity?: string }>;
  disconnect(): Promise<void>;
  /**
   * Phase 3 — tear down the LiveKit Room WITHOUT killing the local preview
   * track / renderer. Use between connect retries so the preview camera feed
   * survives a failed first attempt (no black flash between retries).
   * Safe no-op on web / iOS / older APKs (Proxy swallows).
   */
  disconnectSessionOnly?(): Promise<{ ok: boolean }>;
  setCameraEnabled(opts: { enabled: boolean }): Promise<{ enabled: boolean }>;
  setMicrophoneEnabled(opts: { enabled: boolean }): Promise<{ enabled: boolean }>;
  switchCamera(): Promise<{ position: Lens }>;
  getCameraOwner(): Promise<{ owner: string | null }>;
  claimCameraForWebView(): Promise<void>;
  releaseCameraForWebView(): Promise<void>;
  /**
   * Bug-fix 2026-06-17 — mounts a fullscreen SurfaceViewRenderer behind the
   * WebView and binds it to the current local camera track. Required by
   * `connect()` paths (private call, etc.) that don't go through
   * `startLocalPreview` first — without it the camera publishes but nothing
   * renders, producing a pure white screen on top of the transparent WebView.
   * No-op in bounded (seat) mode.
   */
  attachLocal?(opts?: { mirror?: boolean }): Promise<{ attached: boolean; reason?: string }>;
  detachLocal?(): Promise<{ detached: boolean }>;
  attachLocalSurface(opts: { viewId: string; mirror?: boolean; x?: number; y?: number; width?: number; height?: number }): Promise<void>;
  attachRemoteSurface(opts: { viewId: string; sid?: string; identity?: string; x?: number; y?: number; width?: number; height?: number }): Promise<void>;
  updateSurfaceBounds(opts: { viewId: string; x: number; y: number; width: number; height: number }): Promise<void>;
  detachSurface(opts: { viewId: string }): Promise<void>;
  detachAll(): Promise<void>;
  forceDetachAllSurfaces?(): Promise<{ detached: boolean }>;
  /**
   * Phase 6 (instant-entry) — native equivalent of `Room.prepareConnection`
   * on the Kotlin SDK. Warms DNS + TLS on the OkHttp/WebRTC socket pool used
   * by native publisher paths (host, private call, party). Cheap, no media,
   * no billing. Auto-discarded after ~4 min by the plugin. No-op on web/iOS.
   */
  prepareConnection?(opts: { url: string; token: string }): Promise<{ prepared: boolean; reason?: string }>;
  attachRemote(opts: { sid?: string }): Promise<{ attached: boolean; reason?: string }>;
  reconnectNow(opts?: Record<string, unknown>): Promise<{ connected: boolean; reason?: string }>;
  getActiveSession(): Promise<{
    active: boolean;
    roomScope?: NativeRoomScope | string;
    isHost?: boolean;
    callType?: string;
    boundAtMs?: number;
    ageMs?: number;
    canHardReconnect?: boolean;
  }>;
  setSurviveActivityDestroy(opts: { enabled: boolean }): Promise<{ enabled: boolean }>;
  updateLiveStats(opts: { viewerCount?: number; coinCount?: number; title?: string }): Promise<{ updated: boolean }>;
  refreshToken(opts: { token: string }): Promise<{ refreshed: boolean }>;
  setSubscriberVideoQuality(opts: { enabled?: boolean; quality?: string; source?: string }): Promise<{ applied: boolean }>;
  setRemoteVideoSubscribed(opts: { sid?: string; subscribed?: boolean; source?: string }): Promise<{ applied: boolean }>;
  sendData(opts: { payloadBase64: string; reliable?: boolean; topic?: string }): Promise<{ sent: boolean; reason?: string }>;
  registerRpcMethod(opts: { method: string }): Promise<{ registered: boolean; reason?: string }>;
  unregisterRpcMethod(opts: { method: string }): Promise<{ unregistered: boolean }>;
  performRpc(opts: { destinationIdentity: string; method: string; payload?: string; responseTimeout?: number }): Promise<{ response: string }>;
  respondToRpc(opts: { requestId: string; result?: string; errorMessage?: string }): Promise<{ sent: boolean }>;
  sendText(opts: { text: string; topic?: string; destinationIdentities?: string[] }): Promise<{ sent: boolean; streamId?: string; reason?: string }>;
  registerTextStreamHandler(opts: { topic: string }): Promise<{ registered: boolean }>;
  unregisterTextStreamHandler(opts: { topic: string }): Promise<{ unregistered: boolean }>;
  addListener(eventName: 'rpc-invocation', cb: (e: any) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'text-stream-chunk', cb: (e: any) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'text-stream-complete', cb: (e: any) => void): Promise<PluginListenerHandle>;

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
 * Phase 4 — methods the JS layer KNOWS are intentionally not implemented
 * in the new minimal Kotlin plugin. Hitting these resolves to `undefined`
 * silently (no console noise). Anything outside this list AND outside the
 * plugin's own surface logs one warning per method name in dev so we can
 * track real-world dead calls.
 */
const KNOWN_UNIMPLEMENTED = new Set<string>([
  // Legacy / removed in the 2026-06-14 rebuild — callers wrap in try/catch.
  // `attachLocal` was removed from this set 2026-06-17 — it is now natively
  // implemented (see LiveKitPlugin.kt). Leaving it here would cause the
  // Proxy to short-circuit and the camera surface would never render
  // (root cause of the private-call white-screen bug).
  'setPreferredCodec',
  // Audio routing / mode (web-SDK path handles these)
  'setSpeakerphoneEnabled', 'setProximityMonitoring', 'setAudioMode',
  'getAudioDevices', 'setAudioDevice',
  // Screen share / virtual bg / noise cancellation / PiP
  'isScreenShareSupported', 'startScreenShare', 'stopScreenShare',
  'isVirtualBackgroundSupported', 'setVirtualBackground', 'getVirtualBackgroundState',
  'isNoiseCancellationSupported', 'setNoiseCancellationEnabled', 'getNoiseCancellationState',
  'isPictureInPictureSupported', 'enterPictureInPicture',
  'setAutoPipOnLeaveHint', 'getPipState',
  // Token / RPC / text-stream / metadata
  'sendTextStream',
]);
const warnedDeadCalls = new Set<string>();
const isDev = typeof import.meta !== 'undefined' && (import.meta as any)?.env?.DEV === true;

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
      if (typeof value !== 'undefined') return value;
      // Unknown methods → safe async no-op. Warn once in dev for
      // truly-unexpected names so dead callers don't go unnoticed.
      if (
        isDev &&
        typeof prop === 'string' &&
        !KNOWN_UNIMPLEMENTED.has(prop) &&
        !prop.startsWith('_') &&
        prop !== 'then' && // avoid await/Promise resolution noise
        !warnedDeadCalls.has(prop)
      ) {
        warnedDeadCalls.add(prop);
        console.warn(`[NativeLiveKit] '${String(prop)}' is not implemented natively; resolving as no-op.`);
      }
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

/**
 * Phase 4 — async capability probe. Caches the `methods[]` array returned
 * by Kotlin so callers can do `await hasNativeMethod('disconnectSessionOnly')`
 * before invoking optional methods, instead of relying on try/catch.
 */
let cachedMethods: Set<string> | null = null;
let methodsProbe: Promise<Set<string>> | null = null;
export async function getNativeLiveKitMethods(): Promise<Set<string>> {
  if (cachedMethods) return cachedMethods;
  if (!isNativeLiveKitAvailable()) {
    cachedMethods = new Set();
    return cachedMethods;
  }
  if (!methodsProbe) {
    methodsProbe = NativeLiveKit.isAvailable()
      .then((r) => {
        cachedMethods = new Set(r?.methods ?? []);
        return cachedMethods;
      })
      .catch(() => {
        cachedMethods = new Set();
        return cachedMethods;
      });
  }
  return methodsProbe;
}
export async function hasNativeMethod(name: string): Promise<boolean> {
  const m = await getNativeLiveKitMethods();
  return m.has(name);
}

export default NativeLiveKit;
