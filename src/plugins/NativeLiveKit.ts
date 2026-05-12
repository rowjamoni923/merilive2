/**
 * NativeLiveKit — JS bridge to the Android LiveKit plugin.
 *
 * Backed by io.livekit:livekit-android 2.7.0 + native WebRTC.
 * Replaces browser getUserMedia inside Live and Private Call when running
 * on Capacitor Android. Falls back to web (livekit-client) elsewhere.
 *
 * Native preview/remote tiles are TextureViews mounted *behind* the WebView,
 * so all chat/gift/UI overlays continue to render normally on top.
 */

import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';

export type Lens = 'front' | 'back';
export type Resolution = '720p' | '1080p';

export interface ConnectOptions {
  url: string;
  token: string;
  video?: boolean;
  audio?: boolean;
  lens?: Lens;
  resolution?: Resolution;
  /** Step 14 — shown in the ongoing-call foreground notification. */
  callerName?: string;
  /** Step 14 — e.g. "Video Call", "Voice Call", "Live broadcast". */
  callType?: string;
  /** Step 23 — turn on Insertable-Streams E2EE for this room. */
  e2eeEnabled?: boolean;
  /** Step 23 — AES-GCM shared key (both peers must derive the same value). */
  e2eeKey?: string;
}

export interface ParticipantEvent {
  sid: string;
  identity: string;
  isRemote?: boolean;
}

export interface TrackEvent {
  sid: string;
  identity: string;
  kind: 'video' | 'audio' | string;
}

export interface DisconnectedEvent { reason: string }
export interface QualityEvent { sid: string; quality: string }

export type AudioDeviceType = 'speaker' | 'earpiece' | 'wired' | 'bluetooth' | 'unknown';
export interface NativeAudioDevice { id: number; type: AudioDeviceType; name: string }
export interface AudioDeviceChangedEvent { active: AudioDeviceType; devices: NativeAudioDevice[] }

/** Step 15 — emitted when system audio focus is taken (PSTN call, alarm, etc.) and returned. */
export interface AudioInterruptionEvent { state: 'loss' | 'gain'; permanent: boolean }

/** Step 16/26 — emitted while LiveKit recovers from a network drop.
 *  - "reconnecting"     SDK-level WebSocket retry / ICE restart in progress.
 *  - "degraded"         SDK still hasn't recovered after 15 s — hard reconnect coming.
 *  - "reconnected"      Back online (set `hard:true` when our hard reconnect succeeded).
 *  - "reconnect-failed" One hard-reconnect attempt failed; another may follow.
 *  - "lost"             All retries inside the 60 s window exhausted — UI must surface "Tap to retry".
 */
export interface ConnectionStateEvent {
  state: 'reconnecting' | 'reconnected' | 'degraded' | 'reconnect-failed' | 'lost';
  /** Time since `reconnecting` started, in ms (where applicable). */
  elapsedMs?: number;
  /** True when the event was produced by our hard-reconnect path (Step 26). */
  hard?: boolean;
  attempt?: number;
  attempts?: number;
  trigger?: string;
  error?: string;
}

/** Step 22 — emitted when adaptive bitrate fallback steps the publish ladder. */
export type AdaptiveTier = 'high' | 'medium' | 'low';
export interface AdaptiveTierEvent {
  tier: AdaptiveTier;
  reason: 'downgrade' | 'upgrade' | 'manual-restore' | string;
  simulcast: boolean;
  maxBitrate: number;
}

/** Step 25 — emitted when a video tile freezes (decoded-frame stream halts). */
export interface VideoStallEvent {
  /** Participant sid; "local" for our own preview. */
  sid: string;
  isLocal: boolean;
  /** How long the renderer has been silent. */
  silentMs: number;
  /** 1-based recovery attempt number (0 when state is "failed"). */
  attempt: number;
  /** "stalled" while we're attempting recovery, "failed" after the hard window. */
  state: 'stalled' | 'failed';
}

export interface StallStatus {
  enabled: boolean;
  tracks: Array<{ sid: string; isLocal: boolean; silentMs: number; attempts: number }>;
}

export interface NativeLiveKitPlugin {
  isAvailable(): Promise<{ available: boolean; backend: string; version: string }>;
  connect(opts: ConnectOptions): Promise<{ connected: boolean; sid: string; identity: string }>;
  disconnect(): Promise<void>;
  setMicrophoneEnabled(opts: { enabled: boolean }): Promise<void>;
  setCameraEnabled(opts: { enabled: boolean }): Promise<void>;
  switchCamera(): Promise<void>;
  attachLocal(): Promise<void>;
  attachRemote(opts: { sid: string }): Promise<void>;
  detachAll(): Promise<void>;

  // --- Audio routing (Step 11) ---------------------------------
  setSpeakerphoneEnabled(opts: { enabled: boolean }): Promise<{ speakerphone: boolean }>;
  setProximityMonitoring(opts: { enabled: boolean }): Promise<{ proximity: boolean }>;
  /** "voice" = earpiece + proximity; "video" = speaker; "none"/"off"/"restore" = release. */
  setAudioMode(opts: { mode: 'voice' | 'video' | 'none' | 'off' | 'restore' }): Promise<{ mode: string }>;

  // --- Audio device routing (Step 13) --------------------------
  getAudioDevices(): Promise<{ active: AudioDeviceType; devices: NativeAudioDevice[] }>;
  setAudioDevice(opts: { type: AudioDeviceType }): Promise<{ type: AudioDeviceType; applied: boolean }>;

  // --- Beauty pipeline ↔ camera ownership bridge (Step 21) ----
  /**
   * Hand the physical camera over to (or back from) the DeepAR beauty
   * pipeline. When `enabled: true` the LiveKit native camera track is
   * disabled so DeepAR can open the camera; when `false`, LiveKit
   * resumes its own capture.
   */
  setBeautyPipelineEnabled(opts: { enabled: boolean }): Promise<{ enabled: boolean; hasRoom: boolean }>;

  // --- Adaptive bitrate fallback (Step 22) ----------------------
  /**
   * Toggle the publisher-side bitrate fallback ladder. When enabled
   * (default), the plugin republishes the camera at HIGH→MEDIUM→LOW on
   * sustained POOR uplink quality, and climbs back on EXCELLENT.
   */
  setAdaptiveBitrateEnabled(opts: { enabled: boolean }): Promise<{ enabled: boolean; tier: AdaptiveTier }>;
  getAdaptiveTier(): Promise<{ enabled: boolean; tier: AdaptiveTier; base: AdaptiveTier }>;

  // --- End-to-end encryption (Step 23) -------------------------
  /**
   * Insertable-Streams AES-GCM E2EE for 1:1 Private Calls. Both peers
   * MUST hold the same key (derive from the call session id over your
   * existing signalling channel — never send the key as plain text).
   */
  isE2EESupported(): Promise<{ supported: boolean; algorithm: string }>;
  setE2EEKey(opts: { key: string }): Promise<{ rotated: boolean }>;
  setE2EEEnabled(opts: { enabled: boolean }): Promise<{ enabled: boolean }>;
  getE2EEStatus(): Promise<{ enabled: boolean; hasKey: boolean; hasRoom: boolean }>;

  // --- Lifecycle hardening (Step 24) ---------------------------
  /**
   * Privacy mode for 1:1 Private Calls. When `true`, the camera is
   * automatically disabled when the host backgrounds the app and
   * re-enabled on resume. Mic + room stay alive either way. For Live
   * broadcasts keep this `false` so the stream survives backgrounding.
   * Renderer GPU work is always paused when the app is not visible.
   */
  setPauseCameraOnBackground(opts: { enabled: boolean }): Promise<{ enabled: boolean }>;

  // --- Video stall & black-frame recovery (Step 25) ------------
  /**
   * Toggle the per-track decoded-frame watchdog. When enabled (default),
   * the plugin watches each attached video tile (local + remote) and
   * attempts soft recovery (resubscribe / camera toggle) after 5 s of
   * frozen frames; emits "video-stall-failed" after 12 s.
   */
  setStallWatchdogEnabled(opts: { enabled: boolean }): Promise<{ enabled: boolean }>;
  getStallStatus(): Promise<StallStatus>;

  // --- Network resilience (Step 26) ----------------------------
  /**
   * Force a hard reconnect right now (rebuilds the room from cached
   * connect args). Use behind a "Tap to retry" button when the JS
   * layer receives a `connection-state { state: "lost" }` event.
   */
  reconnectNow(): Promise<{ connected: boolean }>;
  /**
   * Toggle automatic hard-reconnect (default ON). Disable for unit
   * tests or when JS wants to manage retry policy itself.
   */
  setResilienceEnabled(opts: { enabled: boolean }): Promise<{ enabled: boolean }>;
  getConnectionState(): Promise<{
    hasRoom: boolean;
    hasSession: boolean;
    reconnectingSinceMs: number;
    hardReconnectAttempts: number;
    resilienceEnabled: boolean;
  }>;

  // --- Network type & data-saver awareness (Step 27) ----------
  /**
   * Cap the publisher to LOW tier (540p / 700 kbps) whenever the
   * device is on cellular. Restored to baseTier when on WiFi/Ethernet.
   * Default OFF — let UI surface a toggle in the live/call settings.
   */
  setDataSaverEnabled(opts: { enabled: boolean }): Promise<{ enabled: boolean; network: NetworkType }>;
  getNetworkType(): Promise<{ type: NetworkType; dataSaver: boolean }>;

  addListener(eventName: 'participant-connected', cb: (e: ParticipantEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'participant-disconnected', cb: (e: ParticipantEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'track-subscribed', cb: (e: TrackEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'track-unsubscribed', cb: (e: TrackEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'disconnected', cb: (e: DisconnectedEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'connection-quality', cb: (e: QualityEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'audio-device-changed', cb: (e: AudioDeviceChangedEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'audio-interruption', cb: (e: AudioInterruptionEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'connection-state', cb: (e: ConnectionStateEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'adaptive-tier', cb: (e: AdaptiveTierEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'video-stall', cb: (e: VideoStallEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'network-changed', cb: (e: NetworkChangedEvent) => void): Promise<PluginListenerHandle>;
}

export const NativeLiveKit = registerPlugin<NativeLiveKitPlugin>('NativeLiveKit');

/** True only when running inside the Capacitor Android shell with the native plugin available. */
export function isNativeLiveKitAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}
