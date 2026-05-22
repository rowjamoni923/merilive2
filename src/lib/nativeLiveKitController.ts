/**
 * nativeLiveKitController — imperative singleton wrapper around the
 * NativeLiveKit Capacitor plugin.
 *
 * Hooks (useLiveKitClient / useLiveKitCall) call this from join/leave paths
 * when `shouldUseNativeLiveKit()` is true, so the native Android publish
 * path replaces the web `livekit-client` Room.connect() flow.
 *
 * On web/iOS the controller is never invoked (gate returns false), and
 * all calls are still safe no-ops because the underlying plugin returns
 * "not implemented" which we swallow.
 */
import {
  NativeLiveKit,
  type ConnectOptions,
  type Lens,
  type Resolution,
  type AudioDeviceType,
  type NativeAudioDevice,
  type ConnectionStateEvent,
  type AudioInterruptionEvent,
} from '@/plugins/NativeLiveKit';
import type { PluginListenerHandle } from '@capacitor/core';

export interface NativeJoinOptions {
  url: string;
  token: string;
  video?: boolean;
  audio?: boolean;
  lens?: Lens;
  resolution?: Resolution;
  /** Show local preview surface immediately after connect. Default true for hosts. */
  attachLocal?: boolean;
  /** Step 14 — shown in the ongoing-call foreground notification. */
  callerName?: string;
  /** Step 14 — e.g. "Video Call", "Voice Call", "Live broadcast". */
  callType?: string;
}

class NativeLiveKitController {
  private connected = false;
  private busy = false;

  private async attachLocalWithRetry(): Promise<void> {
    const delays = [0, 120, 300, 700, 1200];
    let lastError: unknown = null;

    for (const delay of delays) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      try {
        await NativeLiveKit.attachLocal();
        return;
      } catch (e) {
        lastError = e;
      }
    }

    console.warn('[NativeLiveKitController] attachLocal failed after camera-ready retries:', lastError);
  }

  private async waitForIdle(label: string, timeoutMs = 1800): Promise<void> {
    const started = Date.now();
    while (this.busy) {
      if (Date.now() - started > timeoutMs) {
        throw new Error(`NativeLiveKit: timed out waiting for ${label}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  }

  isConnected() {
    return this.connected;
  }

  async connectAndPublish(opts: NativeJoinOptions): Promise<{ sid: string; identity: string }> {
    await this.waitForIdle('previous media operation');
    this.busy = true;
    try {
      // If a stale session is around, tear it down first to avoid duplicate publishers.
      if (this.connected) {
        try { await NativeLiveKit.disconnect(); } catch { /* noop */ }
        this.connected = false;
      }

      const payload: ConnectOptions = {
        url: opts.url,
        token: opts.token,
        video: opts.video ?? true,
        audio: opts.audio ?? true,
        lens: opts.lens ?? 'front',
        resolution: opts.resolution ?? '1080p',
        callerName: opts.callerName,
        callType: opts.callType,
      };

      const res = await NativeLiveKit.connect(payload);
      this.connected = true;

      if (opts.attachLocal !== false) await this.attachLocalWithRetry();

      return { sid: res.sid, identity: res.identity };
    } finally {
      this.busy = false;
    }
  }

  async disconnect(): Promise<void> {
    await this.waitForIdle('disconnect handoff', 1200);
    if (!this.connected && !this.busy) return;
    this.busy = true;
    try {
      try { await NativeLiveKit.detachAll(); } catch { /* noop */ }
      try { await NativeLiveKit.disconnect(); } catch { /* noop */ }
    } finally {
      this.connected = false;
      this.busy = false;
    }
  }

  async sendData(payload: Uint8Array, opts: { reliable?: boolean; topic?: string } = {}): Promise<boolean> {
    if (!this.connected) return false;
    try {
      let binary = '';
      for (const b of payload) binary += String.fromCharCode(b);
      await NativeLiveKit.sendData({
        payloadBase64: btoa(binary),
        reliable: opts.reliable !== false,
        topic: opts.topic,
      });
      return true;
    } catch (e) {
      console.warn('[NativeLiveKitController] sendData failed:', e);
      return false;
    }
  }

  onDataReceived(cb: (payload: Uint8Array, participantIdentity?: string) => void): () => void {
    let handle: PluginListenerHandle | null = null;
    let cancelled = false;
    NativeLiveKit.addListener('data-received', (e) => {
      try {
        const raw = atob(e.payloadBase64 || '');
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        cb(bytes, e.participantIdentity);
      } catch (err) {
        console.warn('[NativeLiveKitController] data-received decode failed:', err);
      }
    }).then((h) => { if (cancelled) h.remove(); else handle = h; })
      .catch(() => { /* not implemented on web/iOS */ });
    return () => {
      cancelled = true;
      try { handle?.remove(); } catch { /* noop */ }
      handle = null;
    };
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    if (!this.connected) return;
    try { await NativeLiveKit.setMicrophoneEnabled({ enabled }); } catch (e) {
      console.warn('[NativeLiveKitController] setMicrophoneEnabled failed:', e);
    }
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    if (!this.connected) return;
    try { await NativeLiveKit.setCameraEnabled({ enabled }); } catch (e) {
      console.warn('[NativeLiveKitController] setCameraEnabled failed:', e);
    }
  }

  async switchCamera(): Promise<void> {
    if (!this.connected) return;
    try { await NativeLiveKit.switchCamera(); } catch (e) {
      console.warn('[NativeLiveKitController] switchCamera failed:', e);
    }
  }

  async attachRemote(sid: string): Promise<void> {
    if (!this.connected) return;
    try { await NativeLiveKit.attachRemote({ sid }); } catch (e) {
      console.warn('[NativeLiveKitController] attachRemote failed:', e);
    }
  }

  async attachAllRemotes(): Promise<void> {
    if (!this.connected) return;
    try { await NativeLiveKit.attachAllRemotes(); } catch (e) {
      console.warn('[NativeLiveKitController] attachAllRemotes failed:', e);
    }
  }

  // --- Audio routing (Step 11) ----------------------------------
  async setSpeakerphone(enabled: boolean): Promise<void> {
    try { await NativeLiveKit.setSpeakerphoneEnabled({ enabled }); } catch (e) {
      console.warn('[NativeLiveKitController] setSpeakerphone failed:', e);
    }
  }

  async setProximity(enabled: boolean): Promise<void> {
    try { await NativeLiveKit.setProximityMonitoring({ enabled }); } catch (e) {
      console.warn('[NativeLiveKitController] setProximity failed:', e);
    }
  }

  /** Convenience: switch to voice-call (earpiece+proximity) or video/live (speaker) routing. */
  async setAudioMode(mode: 'voice' | 'video' | 'none'): Promise<void> {
    try { await NativeLiveKit.setAudioMode({ mode }); } catch (e) {
      console.warn('[NativeLiveKitController] setAudioMode failed:', e);
    }
  }

  async reconnectNow(): Promise<boolean> {
    try {
      const result = await NativeLiveKit.reconnectNow();
      this.connected = !!result.connected;
      return this.connected;
    } catch (e) {
      console.warn('[NativeLiveKitController] reconnectNow failed:', e);
      return false;
    }
  }

  // --- Audio device routing (Step 13) ----------------------------
  async getAudioDevices(): Promise<{ active: AudioDeviceType; devices: NativeAudioDevice[] }> {
    try { return await NativeLiveKit.getAudioDevices(); }
    catch { return { active: 'unknown', devices: [] }; }
  }

  async setAudioDevice(type: AudioDeviceType): Promise<boolean> {
    try { const r = await NativeLiveKit.setAudioDevice({ type }); return r.applied; }
    catch (e) { console.warn('[NativeLiveKitController] setAudioDevice failed:', e); return false; }
  }

  // --- Screen share (Pkg102 native) ------------------------------
  async isScreenShareSupported(): Promise<{ supported: boolean; active: boolean }> {
    try { return await NativeLiveKit.isScreenShareSupported(); }
    catch { return { supported: false, active: false }; }
  }

  async startScreenShare(): Promise<boolean> {
    if (!this.connected) return false;
    try {
      const r = await NativeLiveKit.startScreenShare();
      return !!r.active;
    } catch (e: any) {
      // permission-denied is a user cancel — silent
      const msg = String(e?.message || e?.code || '');
      if (!/permission|denied|cancel/i.test(msg)) {
        console.warn('[NativeLiveKitController] startScreenShare failed:', e);
      }
      throw e;
    }
  }

  async stopScreenShare(): Promise<void> {
    try { await NativeLiveKit.stopScreenShare(); }
    catch (e) { console.warn('[NativeLiveKitController] stopScreenShare failed:', e); }
  }

  // --- Virtual background / blur (Pkg119 native wiring) ----------
  async isVirtualBackgroundSupported(): Promise<boolean> {
    try {
      const r = await NativeLiveKit.isVirtualBackgroundSupported();
      return !!r.supported;
    } catch { return false; }
  }

  async setVirtualBackground(opts: {
    mode: 'none' | 'blur' | 'image';
    blurRadius?: number;
    imagePath?: string;
  }): Promise<{ ok: boolean; segmenterReady: boolean; imageApplied: boolean }> {
    try {
      const r = await NativeLiveKit.setVirtualBackground(opts);
      return {
        ok: true,
        segmenterReady: !!r.segmenterReady,
        imageApplied: !!r.imageApplied,
      };
    } catch (e) {
      console.warn('[NativeLiveKitController] setVirtualBackground failed:', e);
      return { ok: false, segmenterReady: false, imageApplied: false };
    }
  }

  async getVirtualBackgroundState() {
    try { return await NativeLiveKit.getVirtualBackgroundState(); }
    catch { return null; }
  }

  // --- Lifecycle event subscriptions (Step 17) -------------------
  // Returns an unsubscribe function. Safe no-op on web/iOS.
  /** Fires while LiveKit recovers from a transient network drop. */
  onConnectionState(cb: (e: ConnectionStateEvent) => void): () => void {
    let handle: PluginListenerHandle | null = null;
    let cancelled = false;
    NativeLiveKit.addListener('connection-state', cb)
      .then((h) => { if (cancelled) h.remove(); else handle = h; })
      .catch(() => { /* not implemented on web/iOS */ });
    return () => {
      cancelled = true;
      try { handle?.remove(); } catch { /* noop */ }
      handle = null;
    };
  }

  /** Fires when system audio focus is taken (PSTN call, alarm) and returned. */
  onAudioInterruption(cb: (e: AudioInterruptionEvent) => void): () => void {
    let handle: PluginListenerHandle | null = null;
    let cancelled = false;
    NativeLiveKit.addListener('audio-interruption', cb)
      .then((h) => { if (cancelled) h.remove(); else handle = h; })
      .catch(() => { /* not implemented on web/iOS */ });
    return () => {
      cancelled = true;
      try { handle?.remove(); } catch { /* noop */ }
      handle = null;
    };
  }
}

export const nativeLiveKitController = new NativeLiveKitController();
