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
  getAudioDevices(): Promise<{ active: AudioDeviceType; devices: AudioDeviceInfo[] }>;
  setAudioDevice(opts: { type: AudioDeviceType }): Promise<{ type: AudioDeviceType; applied: boolean }>;

  addListener(eventName: 'participant-connected', cb: (e: ParticipantEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'participant-disconnected', cb: (e: ParticipantEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'track-subscribed', cb: (e: TrackEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'track-unsubscribed', cb: (e: TrackEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'disconnected', cb: (e: DisconnectedEvent) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'connection-quality', cb: (e: QualityEvent) => void): Promise<PluginListenerHandle>;
}

export const NativeLiveKit = registerPlugin<NativeLiveKitPlugin>('NativeLiveKit');

/** True only when running inside the Capacitor Android shell with the native plugin available. */
export function isNativeLiveKitAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}
