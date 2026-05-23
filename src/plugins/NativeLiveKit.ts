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

export interface DataReceivedEvent {
  payloadBase64: string;
  participantSid?: string;
  participantIdentity?: string;
  topic?: string;
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

/** Step 27 — physical network the device is using. */
export type NetworkType = 'none' | 'wifi' | 'cellular' | 'ethernet' | 'other';
export interface NetworkChangedEvent {
  from: NetworkType;
  to: NetworkType;
  /** True when the new network is metered (cellular almost always, paid-WiFi sometimes). */
  metered: boolean;
}

/** Step 28 — periodic RTC stats / telemetry snapshot. */
export interface RtcTrackStat {
  sid: string;
  isLocal: boolean;
  /** Decoded frames-per-second observed during the last sample window. */
  fps: number;
  /** Wall-clock since the last decoded frame (0 means a frame just landed). */
  silentMs: number;
  /** Monotonic frame counter since the track was first attached. */
  framesTotal: number;
  /** How many stall recovery attempts have been spent on this track. */
  recoveryAttempts: number;
  /** SFU-reported quality for this participant. */
  quality: 'excellent' | 'good' | 'poor' | 'lost' | 'unknown' | string;
}

export interface RtcStatsEvent {
  /** ms epoch when the snapshot was sampled (Android System.currentTimeMillis). */
  ts: number;
  tracks: RtcTrackStat[];
  /** Current publisher ladder tier (Step 22). */
  tier: AdaptiveTier;
  /** Session ceiling tier negotiated at connect time. */
  baseTier: AdaptiveTier;
  /** Whether simulcast is currently active for the publisher. */
  simulcast: boolean;
  /** Encoder cap for the current tier (bps). */
  maxBitrate: number;
  /** Physical network underneath WebRTC right now. */
  networkType: NetworkType;
  /** Step 27 data-saver mode (forces LOW on cellular when true). */
  dataSaver: boolean;
  /** Latest SFU-reported quality bucket for our own publisher. */
  localQuality: 'excellent' | 'good' | 'poor' | 'lost' | 'unknown' | string;
  /** True while we're inside a Reconnecting window. */
  reconnecting: boolean;
  /** ms spent in the current reconnecting window (0 when not reconnecting). */
  reconnectingMs: number;
  /** How many hard-reconnect attempts are currently in flight (Step 26). */
  hardReconnectAttempts: number;
  /** Remote participant count (excludes us). */
  remoteParticipantCount: number;
  /** True when Insertable-Streams E2EE is on for this session (Step 23). */
  e2ee: boolean;
}

/** Step 33 — pre-call bandwidth probe verdict. */
export type QualityTier = 'high' | 'medium' | 'low' | 'voice' | 'poor';
export interface QualityProbeResult {
  /** Sample epoch (System.currentTimeMillis on Android). */
  ts: number;
  /** RTT statistics in milliseconds. -1 when no samples returned. */
  rttAvg: number;
  rttMin: number;
  rttMax: number;
  /** Mean-absolute-deviation jitter, in ms. */
  jitter: number;
  /** Estimated packet loss as a percentage (0-100). */
  packetLoss: number;
  /** RTT samples requested. */
  samples: number;
  /** RTT samples that came back successfully. */
  samplesReceived: number;
  /** Observed downlink throughput in kbps (kilobits/sec). -1 when no `downloadUrl` was provided. */
  downKbps: number;
  /** Verdict bucket. */
  tier: QualityTier;
  /** Suggested publisher ladder tier for this network. */
  recommendedTier: AdaptiveTier;
  /** True when the network is too weak for video — JS should disable camera. */
  recommendedAudioOnly: boolean;
  /** Suggested codec (`auto` for healthy networks, frugal codec on weak links when HW-encode is available). */
  recommendedCodec: 'auto' | 'vp8' | 'vp9' | 'h264' | 'av1';
  /** Human-readable warning to surface above the "Start Call" button (null when tier is high/medium). */
  warning: string | null;
  /** Physical network underneath the probe. */
  networkType: NetworkType;
  /** True when the OS has Background Data Saver enabled. */
  dataSaver: boolean;
}

export interface QualityProbeProgressEvent {
  stage:
    | 'starting'
    | 'rtt'
    | 'rtt-done'
    | 'throughput'
    | 'throughput-done'
    | 'throughput-skipped'
    | 'done';
  /** 0-100 progress for a UI bar. */
  percent: number;
  detail?: Record<string, unknown>;
}

export interface NativeLiveKitPlugin {
  isAvailable(): Promise<{ available: boolean; backend: string; version: string }>;
  connect(opts: ConnectOptions): Promise<{ connected: boolean; sid: string; identity: string }>;
  disconnect(): Promise<void>;
  sendData(opts: { payloadBase64: string; reliable?: boolean; topic?: string }): Promise<{ sent: boolean }>;
  setMicrophoneEnabled(opts: { enabled: boolean }): Promise<void>;
  setCameraEnabled(opts: { enabled: boolean }): Promise<void>;
  switchCamera(): Promise<void>;
  attachLocal(): Promise<void>;
  attachRemote(opts: { sid: string }): Promise<void>;
  attachAllRemotes(): Promise<{ attached: number }>;
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
  // Pkg201 — broadcast beauty injection (feature-flag, off by default).
  setBeautyBroadcast(opts: {
    enabled: boolean;
    smooth?: number; white?: number; thinFace?: number; bigEye?: number; lipstick?: number;
  }): Promise<{ enabled: boolean; hasRoom: boolean }>;

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

  // --- RTC stats / telemetry (Step 28) -------------------------
  /**
   * Toggle the periodic native stats collector. When enabled (default),
   * the plugin emits `rtc-stats` events every `intervalMs` (default
   * 3000, min 1000) for HUD/QoE consumers. Costs effectively zero per
   * frame — fps is read from the existing stall-watchdog frame counter.
   */
  setStatsCollectorEnabled(opts: { enabled: boolean; intervalMs?: number }): Promise<{ enabled: boolean; intervalMs: number }>;
  /** One-shot snapshot of the same payload that `rtc-stats` carries. */
  getRtcStats(): Promise<RtcStatsEvent & { hasRoom: boolean; enabled?: boolean; intervalMs?: number }>;

  // --- Picture-in-Picture (Step 29) ----------------------------
  /**
   * Whether the device + Android version supports PiP. Always false
   * on Android < 8.0 (API 26) or on TVs / form factors that opt out.
   */
  isPictureInPictureSupported(): Promise<{ supported: boolean; inPip: boolean }>;
  /**
   * Manually shrink the call to a floating PiP window — wire this to a
   * "minimise" button in the in-call UI. `aspect` is "W:H" (default
   * "9:16" for portrait video, "16:9" for landscape Live broadcasts,
   * "1:1" for voice calls). Resolves with `entered:false` when PiP
   * isn't supported or the activity is already in PiP.
   */
  enterPictureInPicture(opts?: { aspect?: '9:16' | '16:9' | '1:1' | string }): Promise<{ entered: boolean; supported: boolean }>;
  /**
   * Auto-enter PiP when the user taps the home button mid-call (parity
   * with WhatsApp / Meet). Default OFF — Live broadcasters usually
   * stay full-screen; enable for 1:1 video / voice calls.
   */
  setAutoPipOnLeaveHint(opts: { enabled: boolean; aspect?: string }): Promise<{ enabled: boolean; supported: boolean }>;
  getPipState(): Promise<{
    supported: boolean;
    inPip: boolean;
    autoOnLeaveHint: boolean;
    aspectNumerator: number;
    aspectDenominator: number;
  }>;

  // --- Bluetooth SCO + headset hardware buttons (Step 30) -----
  /**
   * Explicitly start/stop the Bluetooth SCO link. Prefer
   * `setAudioDevice({ type: 'bluetooth' })` on Android 12+ — this
   * entry point is the legacy fallback (and a manual override
   * for QA / pre-API-31 devices).
   */
  setBluetoothScoEnabled(opts: { enabled: boolean }): Promise<{
    enabled: boolean;
    applied: boolean;
    state: 'disconnected' | 'connecting' | 'connected' | 'error';
  }>;
  getBluetoothScoState(): Promise<{
    state: 'disconnected' | 'connecting' | 'connected' | 'error';
    available: boolean;
  }>;
  /**
   * Toggle hardware media-button capture (wired-remote single-click,
   * BT headset answer/end button, KEYCODE_HEADSETHOOK). When enabled
   * and a room is connected, the plugin owns the system MediaSession
   * and emits `headset-button` events. Default ON.
   */
  setHeadsetButtonsEnabled(opts: { enabled: boolean }): Promise<{ enabled: boolean; active: boolean }>;
  getHeadsetState(): Promise<{
    wiredPlugged: boolean;
    wiredHasMic: boolean;
    scoState: 'disconnected' | 'connecting' | 'connected' | 'error';
    buttonsEnabled: boolean;
    mediaSessionActive: boolean;
  }>;

  // --- Codec negotiation + hardware acceleration (Step 32) ----
  /**
   * Walk Android's MediaCodecList and report per-codec hardware
   * encode/decode availability. Use `recommended` as the default
   * codec for this device class (HW AV1 → AV1, else HW VP9, else
   * HW H264, else VP8). `negotiated` is what the active room picked.
   */
  getCodecCapabilities(): Promise<{
    codecs: Record<
      'vp8' | 'vp9' | 'h264' | 'av1',
      { hwEncode: boolean; hwDecode: boolean; encoders: string[]; decoders: string[]; mime: string }
    >;
    preferred: 'auto' | 'vp8' | 'vp9' | 'h264' | 'av1';
    negotiated: string;
    recommended: 'vp8' | 'vp9' | 'h264' | 'av1';
  }>;
  /**
   * Pin the publisher to a specific codec on the next connect() call.
   * Codec is part of SDP — does NOT hot-swap an active room. If the
   * device can't HW-encode the choice, the SDK falls back to its
   * default at connect time and `hwEncode:false` is returned.
   */
  setPreferredCodec(opts: {
    codec: 'auto' | 'vp8' | 'vp9' | 'h264' | 'av1';
  }): Promise<{
    codec: 'auto' | 'vp8' | 'vp9' | 'h264' | 'av1';
    previous: 'auto' | 'vp8' | 'vp9' | 'h264' | 'av1';
    hwEncode: boolean;
    /** True when a room is already connected — JS should toast "Reconnect to apply". */
    requiresReconnect: boolean;
    applied: boolean;
  }>;
  getCodecState(): Promise<{
    preferred: 'auto' | 'vp8' | 'vp9' | 'h264' | 'av1';
    negotiated: string;
    hasRoom: boolean;
    /** Always true — DefaultVideoEncoderFactory wraps MediaCodec for every codec. */
    hardwareAcceleration: boolean;
  }>;

  // --- Bandwidth probe + pre-call quality test (Step 33) ------
  /**
   * Run a quick (≈1-2 s) bandwidth + RTT probe BEFORE calling
   * `connect()`. Used by the Pre-Call screen to predict whether the
   * device's current network can sustain a 1080p / 720p video call,
   * and to auto-fall-back to voice-only when it can't.
   *
   * - `pingUrl` — HEAD endpoint for RTT samples. Default `https://www.gstatic.com/generate_204` (204 No Content, ~50 B response).
   * - `downloadUrl` — Optional small payload (≤ 4 MB). Omit to skip the throughput stage and rely on RTT only.
   * - `samples` — RTT sample count. Default 5, max 20.
   * - `downloadBytes` — Cap on bytes pulled from `downloadUrl`. Default 512 KB.
   * - `timeoutMs` — Per-request hard timeout. Default 6 s.
   *
   * Emits `quality-probe-progress` events while running. Resolves
   * with the verdict and a recommended publish tier / codec.
   */
  runPreCallQualityProbe(opts?: {
    pingUrl?: string;
    downloadUrl?: string;
    samples?: number;
    downloadBytes?: number;
    timeoutMs?: number;
  }): Promise<QualityProbeResult>;
  /** Cancel a probe currently in-flight (e.g. user backed out of Pre-Call). */
  cancelPreCallQualityProbe(): Promise<{ cancelled: boolean }>;
  /** Last completed result (cached per-process). */
  getLastQualityProbe(): Promise<{ hasResult: boolean; result?: QualityProbeResult }>;

  // --- Screen-share publishing (Step 34) ----------------------
  /**
   * Whether the device + Android version supports MediaProjection
   * screen capture. Almost always true on Android 5.0+; some work-
   * profile / TV form factors decline.
   */
  isScreenShareSupported(): Promise<{ supported: boolean; active: boolean }>;
  /** Current sharing state. */
  isScreenSharing(): Promise<{ active: boolean; startedAt: number; hasRoom: boolean }>;
  /**
   * Trigger the system screen-capture permission prompt and, on
   * approval, publish the device display as a second video track on
   * the active room (alongside the camera). The room MUST already be
   * connected — call `connect()` first.
   *
   * Resolves with `{ active:true }` once the SFU is publishing. Rejects
   * with `permission-denied` if the user dismisses the prompt.
   */
  startScreenShare(): Promise<{ active: boolean; startedAt?: number; alreadyOn?: boolean }>;
  /** Stop the screen-share track and tear down the foreground service. */
  stopScreenShare(): Promise<{ active: boolean; alreadyOff?: boolean }>;

  // --- Push-to-Talk (Step 35) ---------------------------------
  /**
   * Enter / leave PTT mode. While `enabled:true` the local mic is
   * forced muted until `setPushToTalkHeld({held:true})` is called —
   * use this for Party Rooms where everyone is spectating by default
   * and only seat-holders broadcast.
   */
  setPushToTalkEnabled(opts: { enabled: boolean }): Promise<{ enabled: boolean; micOpen: boolean }>;
  /**
   * Press / release the PTT button. Bind to the on-screen mic-bubble
   * `pointerdown` / `pointerup` (or a hardware key) for an instant
   * gate — flips the LiveKit audio track's `enabled` flag in place,
   * so there is no republish gap or audible "pop".
   */
  setPushToTalkHeld(opts: { held: boolean }): Promise<{ micOpen: boolean }>;
  getPushToTalkState(): Promise<{ enabled: boolean; micOpen: boolean; hasRoom: boolean }>;

  // --- Spatial audio (Step 35) ---------------------------------
  /**
   * Enable distance-attenuated remote-audio gain. Coordinates are
   * in arbitrary "scene units" — JS picks the scale (1.0 = "1 metre"
   * in the falloff math).
   *
   * - `nearMeters` — distance at which gain stays 1.0 (default 1.0)
   * - `farMeters`  — distance at which gain bottoms out (default 8.0)
   * - `minVolume`  — floor gain (0.0-1.0, default 0.05)
   *
   * Disabling this resets every remote audio track to unity gain.
   */
  setSpatialAudioEnabled(opts: {
    enabled: boolean;
    nearMeters?: number;
    farMeters?: number;
    minVolume?: number;
  }): Promise<{ enabled: boolean; nearMeters: number; farMeters: number; minVolume: number }>;
  /** Move the listener (the local user) — usually the seat they occupy on screen. */
  setListenerPosition(opts: { x: number; y: number }): Promise<{ x: number; y: number }>;
  /** Move a remote participant — call when a Party Room avatar drags between seats. */
  setParticipantPosition(opts: { sid: string; x: number; y: number }): Promise<{ sid: string; x: number; y: number }>;
  /** Drop a single participant (or all when `sid` is omitted) and reset their gain to unity. */
  clearParticipantPosition(opts?: { sid?: string }): Promise<{ cleared: string }>;
  getSpatialAudioState(): Promise<{
    enabled: boolean;
    nearMeters: number;
    farMeters: number;
    minVolume: number;
    listenerX: number;
    listenerY: number;
    trackedParticipants: number;
  }>;

  // --- Virtual background / blur (Step 36) --------------------
  /**
   * Soft probe — returns `supported:false` when the MediaPipe selfie-
   * segmentation model file is missing from the APK, so the UI can
   * hide the "Background Effects" button entirely on builds that
   * skipped the asset.
   */
  isVirtualBackgroundSupported(): Promise<{ supported: boolean; requiresAsset: string }>;
  /**
   * Apply a virtual-background effect to the LOCAL camera track.
   * The processor stays attached across camera switches.
   *
   * - `mode: "none"`  — pass-through (instant toggle, zero overhead).
   * - `mode: "blur"`  — Gaussian blur with `blurRadius` (1-25, default 18).
   * - `mode: "image"` — replace background with the file at `imagePath`
   *                     (absolute path on the device — copy from assets
   *                     or `Filesystem.writeFile` first).
   *
   * `segmenterReady:false` in the result means the MediaPipe model
   * couldn't be loaded — JS should fall back to "none" and surface
   * an "Effect unavailable on this device" toast.
   */
  setVirtualBackground(opts: {
    mode: 'none' | 'blur' | 'image';
    blurRadius?: number;
    imagePath?: string;
  }): Promise<{
    mode: string;
    blurRadius: number;
    imageApplied: boolean;
    segmenterReady: boolean;
    hasRoom: boolean;
  }>;
  getVirtualBackgroundState(): Promise<{
    mode: 'none' | 'blur' | 'image' | string;
    blurRadius: number;
    processorAttached: boolean;
    hasRoom: boolean;
  }>;

  // --- Noise cancellation (Pkg123 native) ---------------------
  /**
   * Soft probe — returns supported:false on builds where the native
   * noise-suppression module is missing, so the UI can hide the toggle.
   * Backed by WebRTC AudioProcessing NS (and, where available, the
   * LiveKit Android SDK's enhanced noise filter).
   */
  isNoiseCancellationSupported(): Promise<{ supported: boolean }>;
  /**
   * Toggle background-noise suppression on the LOCAL mic capture path.
   * Persists across track re-publish (camera switch, mute/unmute, etc.).
   * Returns the applied state — false when unsupported.
   */
  setNoiseCancellationEnabled(opts: { enabled: boolean }): Promise<{ enabled: boolean; applied: boolean }>;
  getNoiseCancellationState(): Promise<{ enabled: boolean; supported: boolean; hasRoom: boolean }>;



  addListener(eventName: 'participant-connected', cb: (e: ParticipantEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'participant-disconnected', cb: (e: ParticipantEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'track-subscribed', cb: (e: TrackEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'track-unsubscribed', cb: (e: TrackEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'data-received', cb: (e: DataReceivedEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'disconnected', cb: (e: DisconnectedEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'connection-quality', cb: (e: QualityEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'audio-device-changed', cb: (e: AudioDeviceChangedEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'audio-interruption', cb: (e: AudioInterruptionEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'connection-state', cb: (e: ConnectionStateEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'adaptive-tier', cb: (e: AdaptiveTierEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'video-stall', cb: (e: VideoStallEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'network-changed', cb: (e: NetworkChangedEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'rtc-stats', cb: (e: RtcStatsEvent) => void): Promise<PluginListenerHandle>;
  /** Step 29 — fired both when entering and leaving Picture-in-Picture. */
  addListener(
    eventName: 'pip-changed',
    cb: (e: { isInPip: boolean; aspectNumerator: number; aspectDenominator: number }) => void,
  ): Promise<PluginListenerHandle>;
  /** Step 30 — wired headset (3.5 mm / USB-C) plug or unplug. */
  addListener(
    eventName: 'headset-plug',
    cb: (e: { plugged: boolean; hasMic: boolean; name: string }) => void,
  ): Promise<PluginListenerHandle>;
  /** Step 30 — Bluetooth Hands-Free SCO link state transitions. */
  addListener(
    eventName: 'sco-state-changed',
    cb: (e: { state: 'disconnected' | 'connecting' | 'connected' | 'error' }) => void,
  ): Promise<PluginListenerHandle>;
  /**
   * Step 30 — hardware media-button press from a wired remote, BT
   * headset answer/end button, or KEYCODE_HEADSETHOOK. `action` is the
   * normalised intent: "hook" covers single click / play-pause /
   * answer-or-hangup, "next"/"previous" the multi-click skip variants.
   */
  addListener(
    eventName: 'headset-button',
    cb: (e: { action: 'hook' | 'play' | 'pause' | 'next' | 'previous'; keyCode: number; repeatCount: number }) => void,
  ): Promise<PluginListenerHandle>;
  /** Step 33 — incremental progress while `runPreCallQualityProbe` is running. */
  addListener(
    eventName: 'quality-probe-progress',
    cb: (e: QualityProbeProgressEvent) => void,
  ): Promise<PluginListenerHandle>;
  /** Step 34 — screen-share lifecycle ("starting" → "started" → "stopped", or "denied" / "error"). */
  addListener(
    eventName: 'screen-share-state',
    cb: (e: { state: 'starting' | 'started' | 'stopped' | 'denied' | 'error'; active: boolean; startedAt: number; error?: string }) => void,
  ): Promise<PluginListenerHandle>;
  /** Step 35 — PTT mode/gate transitions. `reason` is "enabled" | "disabled" | "press" | "release". */
  addListener(
    eventName: 'ptt-state',
    cb: (e: { enabled: boolean; micOpen: boolean; reason: 'enabled' | 'disabled' | 'press' | 'release' }) => void,
  ): Promise<PluginListenerHandle>;
}

export const NativeLiveKit = registerPlugin<NativeLiveKitPlugin>('NativeLiveKit');

/** True only when running inside the Capacitor Android shell with the native plugin available. */
export function isNativeLiveKitAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}
