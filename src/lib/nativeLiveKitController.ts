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
  type NativeRoomScope,
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
  /** Phase F — audio profile (voice / broadcast / music). Defaults inferred from broadcastMode. */
  audioProfile?: 'voice' | 'broadcast' | 'music';
  /** Phase I — "live" swaps the FGS notification to Bigo/Chamet LIVE style. */
  broadcastMode?: 'call' | 'live';
  /** Android native media family; no WebView camera/WebRTC fallback for live/party/call. */
  roomScope?: NativeRoomScope;
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

  private async waitForIdle(label: string, timeoutMs = 6500): Promise<void> {
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
      // Never adopt a surviving Room for live / party / private call media.
      // Professional Android apps keep exactly one visible native SDK media
      // owner; stale adoption is what creates "already live" and background
      // camera leaks after an explicit end/exit.
      try {
        const active = await NativeLiveKit.getActiveSession();
        if (active?.active) {
          try { await NativeLiveKit.detachAll(); } catch { /* noop */ }
          try { await NativeLiveKit.disconnect(); } catch { /* noop */ }
          this.connected = false;
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      } catch { /* getActiveSession not implemented on web/iOS — fall through */ }

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
        // Phase I — default to "broadcast" audio + "live" notification for hosts.
        audioProfile: opts.audioProfile ?? (opts.broadcastMode === 'live' ? 'broadcast' : undefined),
        broadcastMode: opts.broadcastMode,
        roomScope: opts.roomScope,
      };

      try {
        const res = await NativeLiveKit.connect(payload);
        this.connected = true;

        if (opts.attachLocal !== false) await this.attachLocalWithRetry();

        return { sid: res.sid, identity: res.identity };
      } catch (error) {
        this.connected = false;
        try { await NativeLiveKit.detachAll(); } catch { /* noop */ }
        try { await NativeLiveKit.disconnect(); } catch { /* noop */ }
        throw error;
      }
    } finally {
      this.busy = false;
    }
  }

  // --- Phase 1A.2 Step 3 — Activity-survival API ---------------------
  /**
   * Query whether the native plugin currently holds a surviving Room.
   * Safe on web/iOS — returns { active:false } when the plugin is absent.
   */
  async getActiveSession() {
    try { return await NativeLiveKit.getActiveSession(); }
    catch { return { active: false, boundAtMs: 0, ageMs: 0, canHardReconnect: false } as const; }
  }

  /**
   * Opt the current Room into surviving the NEXT Activity destroy. One-shot:
   * the native side clears the flag on adoption or unbind. Call from
   * in-app navigation handlers; do NOT call from user-initiated leave
   * (back button = real disconnect).
   */
  async setSurviveActivityDestroy(enabled: boolean): Promise<void> {
    try { await NativeLiveKit.setSurviveActivityDestroy({ enabled }); }
    catch { /* not implemented on web/iOS */ }
  }

  /**
   * Phase I — update Bigo-style LIVE foreground notification. No-op on
   * web/iOS or when broadcastMode !== 'live'. Cheap; safe per realtime tick.
   */
  async updateLiveStats(opts: { viewerCount?: number; coinCount?: number; title?: string }): Promise<void> {
    try { await NativeLiveKit.updateLiveStats(opts); }
    catch { /* not implemented on web/iOS */ }
  }


  async disconnect(): Promise<void> {
    try {
      await this.waitForIdle('disconnect handoff', 5000);
    } catch (error) {
      console.warn('[NativeLiveKitController] disconnect forcing through busy native state:', error);
    }
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
    try {
      const r = await NativeLiveKit.setCameraEnabled({ enabled });
      if (enabled && (r as any)?.skipped) throw new Error((r as any)?.reason || 'camera-enable-skipped');
    } catch (e) {
      console.warn('[NativeLiveKitController] setCameraEnabled failed:', e);
      if (enabled) await this.reconnectNow().catch(() => false);
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

  async getRemoteParticipants(): Promise<Array<{ sid: string; identity: string }>> {
    if (!this.connected) return [];
    try {
      const result = await NativeLiveKit.getRemoteParticipants();
      return Array.isArray(result?.participants) ? result.participants : [];
    } catch {
      return [];
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

  // --- Noise cancellation (Pkg123 native wiring) ----------------
  async isNoiseCancellationSupported(): Promise<boolean> {
    try {
      const r = await NativeLiveKit.isNoiseCancellationSupported();
      return !!r.supported;
    } catch { return false; }
  }

  async setNoiseCancellationEnabled(enabled: boolean): Promise<{ ok: boolean; enabled: boolean }> {
    try {
      const r = await NativeLiveKit.setNoiseCancellationEnabled({ enabled });
      return { ok: !!r.applied, enabled: !!r.enabled };
    } catch (e) {
      console.warn('[NativeLiveKitController] setNoiseCancellationEnabled failed:', e);
      return { ok: false, enabled: false };
    }
  }

  async getNoiseCancellationState() {
    try { return await NativeLiveKit.getNoiseCancellationState(); }
    catch { return null; }
  }


  // --- Picture-in-Picture (Step 29) ----------------------------
  async isPictureInPictureSupported(): Promise<{ supported: boolean; inPip: boolean }> {
    try { return await NativeLiveKit.isPictureInPictureSupported(); }
    catch { return { supported: false, inPip: false }; }
  }

  async enterPictureInPicture(opts?: { aspect?: string }): Promise<boolean> {
    try {
      const r = await NativeLiveKit.enterPictureInPicture(opts);
      return !!r.entered;
    } catch { return false; }
  }

  async setAutoPipOnLeaveHint(enabled: boolean, aspect?: string): Promise<boolean> {
    try {
      const r = await NativeLiveKit.setAutoPipOnLeaveHint({ enabled, aspect });
      return !!r.supported;
    } catch { return false; }
  }

  async getPipState() {
    try { return await NativeLiveKit.getPipState(); }
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

  /** Fires when the activity enters or leaves PiP mode. */
  onPipChanged(cb: (e: { isInPip: boolean }) => void): () => void {
    let handle: PluginListenerHandle | null = null;
    let cancelled = false;
    NativeLiveKit.addListener('pip-changed', cb)
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
