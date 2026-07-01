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
  isNativeLiveKitAvailable,
  type ConnectOptions,
  type Lens,
  type Resolution,
  type AudioDeviceType,
  type NativeAudioDevice,
  type ConnectionStateEvent,
  type AudioInterruptionEvent,
  type NativeRoomScope,
} from '@/plugins/NativeLiveKit';
import { LIVEKIT_PUBLISH_LOCK } from '@/lib/livekitPublishLock';
import { recordCallDiag } from '@/lib/callDiagnostics';
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
  /** Android native media family; no WebView camera/LiveKit (Android native) fallback for live/party/call. */
  roomScope?: NativeRoomScope;
  /** Phase III.c — party/live host flag for 60s background grace. */
  isHost?: boolean;
}

class NativeLiveKitController {
  private connected = false;
  private busy = false;
  private autoAttachLocalRenderer = true;
  private boundedSurfaceMode = false;
  private activeFeature: NativeRoomScope | null = null;
  private previewFeature: NativeRoomScope | null = null;
  private previewStartPromise: Promise<boolean> | null = null;
  private mediaEpoch = 0;

  private inferScopeFromCallType(callType?: string | null): NativeRoomScope | null {
    const s = String(callType || '').toLowerCase();
    if (s.includes('party')) return 'party';
    if (s.includes('call')) return 'call';
    if (s.includes('live') || s.includes('broadcast')) return 'live';
    return null;
  }

  private async attachLocalWithRetry(): Promise<void> {
    if (!isNativeLiveKitAvailable()) return;
    // 2026-06-17 — pass `mirror: true` to the native attach so front-camera
    // local feed reads correctly (selfie-mirrored). The Kotlin side now
    // mounts a fullscreen SurfaceViewRenderer behind the WebView and binds
    // it to the current local camera track. Without that mount the WebView's
    // opaque white background covered the empty surface = white screen.
    const delays = [0, 120, 300, 700, 1200];
    let lastError: unknown = null;
    let lastResult: { attached?: boolean; reason?: string } | undefined;
    const epoch = this.mediaEpoch;

    for (const delay of delays) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      // If the user already hung up / left / navigated while the retry cadence
      // was sleeping, never attach a stale fullscreen native renderer to the
      // next screen or next media session.
      if (
        epoch !== this.mediaEpoch ||
        this.boundedSurfaceMode ||
        !this.autoAttachLocalRenderer ||
        (!this.connected && !this.previewFeature)
      ) return;
      try {
        const res = await (NativeLiveKit as any).attachLocal({ mirror: true });
        lastResult = res as { attached?: boolean; reason?: string } | undefined;
        // bounded (party seat) mode reports attached=false with reason=bounded;
        // that's a successful no-op — don't keep retrying.
        if (!res || res.attached !== false || res.reason === 'bounded') {
          recordCallDiag('native-attach', 'attachLocal', {
            mode: res?.reason === 'bounded' ? 'bounded' : 'fullscreen',
            reason: res?.reason ?? 'ok',
            scope: this.activeFeature ?? this.previewFeature,
            delayMs: delay,
          });
          return;
        }
        // attached=false with reason=no_track → camera track not ready yet,
        // fall through to retry after the next delay.
      } catch (e) {
        lastError = e;
      }
    }

    recordCallDiag('error', 'attachLocal:exhausted', {
      lastResult, lastError: String((lastError as Error)?.message ?? lastError ?? ''),
      scope: this.activeFeature ?? this.previewFeature,
    }, 'error');
    console.warn('[NativeLiveKitController] attachLocal incomplete after retries:', lastResult, lastError);
  }


  async attachLocal(): Promise<void> {
    if (!isNativeLiveKitAvailable()) return;
    if (!this.connected || !this.autoAttachLocalRenderer || this.boundedSurfaceMode) return;
    await this.attachLocalWithRetry();
  }

  /** True only for legacy/fullscreen local-renderer sessions. Modern live,
   * party and private-call screens use bounded <NativeVideoView /> slots, so
   * native event recovery must not re-mount the fullscreen local renderer. */
  canAttachFullscreenLocal(): boolean {
    return this.connected && this.autoAttachLocalRenderer && !this.boundedSurfaceMode;
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

  /** Phase 1A — read the current preview feature scope (or null when no preview owned). */
  getPreviewScope(): NativeRoomScope | null {
    return this.previewFeature;
  }

  /** Phase 1A — read the currently active session scope (or null when not connected). */
  getActiveScope(): NativeRoomScope | null {
    return this.activeFeature;
  }

  async connectAndPublish(opts: NativeJoinOptions): Promise<{ sid: string; identity: string }> {
    if (!isNativeLiveKitAvailable()) return { sid: '', identity: '' };
    await this.waitForIdle('previous media operation');
    this.busy = true;
    try {
      const requestedFeature = opts.roomScope ?? null;
      if (this.previewFeature && requestedFeature && this.previewFeature !== requestedFeature) {
        throw new Error(`NativeLiveKit preview active for ${this.previewFeature}; refusing ${requestedFeature} takeover before explicit cleanup`);
      }
      if (this.connected && this.activeFeature && requestedFeature && this.activeFeature !== requestedFeature) {
        throw new Error(`NativeLiveKit session already active for ${this.activeFeature}; refusing ${requestedFeature} takeover`);
      }
      // Preview → session handoff: DO NOT stopLocalPreview() here. The native
      // Android plugin already promotes the running prejoin Camera2
      // LocalVideoTrack inside connectInternal() when previewRoom/previewTrack
      // exist, so Live / video party / game party / private call reuse the
      // already-open camera instead of closing and reopening it.
      // If native already completed the same-scope promotion while JS is still
      // resolving (rapid taps / phase remount), adopt it instead of tearing the
      // camera down. Different-scope sessions are still rejected below.
      const active = await NativeLiveKit.getActiveSession().catch(() => null);
      if (active?.active) {
        const sessionScope = (active.roomScope || this.inferScopeFromCallType(active.callType) || null) as NativeRoomScope | null;
        const activeScope = this.activeFeature ?? sessionScope;
        if (requestedFeature && activeScope && activeScope !== requestedFeature) {
          throw new Error(`NativeLiveKit active ${activeScope} session; refusing ${requestedFeature} takeover`);
        }
        if (!requestedFeature || !activeScope || activeScope === requestedFeature) {
          this.connected = true;
          this.activeFeature = requestedFeature ?? activeScope ?? null;
          this.previewFeature = null;
          this.boundedSurfaceMode = opts.attachLocal === false;
          this.autoAttachLocalRenderer = opts.attachLocal !== false;
          if (this.boundedSurfaceMode) {
            this.mediaEpoch += 1;
            try { await NativeLiveKit.detachLocal?.(); } catch { /* noop */ }
          }
          if (this.autoAttachLocalRenderer) await this.attachLocalWithRetry();
          return { sid: '', identity: '' };
        }
          try { await NativeLiveKit.detachAll(); } catch { /* noop */ }
          try { await NativeLiveKit.disconnect(); } catch { /* noop */ }
          this.connected = false;
          this.activeFeature = null;
          await new Promise((resolve) => setTimeout(resolve, 300));
      }

      // If a stale session is around, tear it down first to avoid duplicate publishers.
      if (this.connected) {
        try { await NativeLiveKit.disconnect(); } catch { /* noop */ }
        this.connected = false;
        this.activeFeature = null;
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
        isHost: opts.isHost,
        // When JS will render video through bounded <NativeVideoView /> slots
        // (party seats, private-call remote fullscreen + local PiP), tell
        // Kotlin to remove any prejoin fullscreen preview renderer before the
        // session is promoted. This keeps native video behind the React shell
        // without an old full-screen local Surface competing with the slots.
        boundedSurfaces: opts.attachLocal === false,
        // Locked publish quality — pinned natural 3:4 capture + 3-layer
        // simulcast. Keeps live / party / private-call video sharp; SFU
        // never down-tunes the base layer (anti-blur contract). Callers
        // may override per-feature but should NOT loosen the cap.
        captureWidth: (opts as { captureWidth?: number }).captureWidth ?? LIVEKIT_PUBLISH_LOCK.captureWidth,
        captureHeight: (opts as { captureHeight?: number }).captureHeight ?? LIVEKIT_PUBLISH_LOCK.captureHeight,
        captureFps: (opts as { captureFps?: number }).captureFps ?? LIVEKIT_PUBLISH_LOCK.captureFps,
        maxBitrate: (opts as { maxBitrate?: number }).maxBitrate ?? LIVEKIT_PUBLISH_LOCK.maxBitrate,
        maxFps: (opts as { maxFps?: number }).maxFps ?? LIVEKIT_PUBLISH_LOCK.maxFps,
        simulcast: (opts as { simulcast?: boolean }).simulcast ?? LIVEKIT_PUBLISH_LOCK.simulcast,
      };

      try {
        if (opts.attachLocal === false) {
          // Bounded React/native slots (viewer live, party seats, private-call
          // remote fullscreen + local PiP) must never inherit a stale full-screen
          // preview renderer from prejoin/reconnect. Detach the renderer
          // explicitly before connect; keep the CameraX track alive for publish.
          this.mediaEpoch += 1;
          this.boundedSurfaceMode = true;
          try { await NativeLiveKit.detachLocal?.(); } catch { /* noop */ }
          this.autoAttachLocalRenderer = false;
        } else {
          this.boundedSurfaceMode = false;
        }
        const res = await NativeLiveKit.connect(payload);
        this.connected = true;
        this.activeFeature = requestedFeature;
        this.previewFeature = null;
        this.boundedSurfaceMode = opts.attachLocal === false;
        this.autoAttachLocalRenderer = opts.attachLocal !== false;

        recordCallDiag('session', 'connect', {
          scope: requestedFeature,
          callType: opts.callType,
          boundedSurfaces: payload.boundedSurfaces === true,
          surfaceMode: payload.boundedSurfaces ? 'bounded' : 'fullscreen',
          captureW: payload.captureWidth,
          captureH: payload.captureHeight,
          maxBitrate: payload.maxBitrate,
        });
        recordCallDiag('surface-mode', payload.boundedSurfaces ? 'bounded' : 'fullscreen', {
          scope: requestedFeature, callType: opts.callType,
        });

        if (this.autoAttachLocalRenderer) await this.attachLocalWithRetry();

        return { sid: res.sid, identity: res.identity };
      } catch (error) {
        this.connected = false;
        this.activeFeature = null;
        this.boundedSurfaceMode = opts.attachLocal === false;
        // Connect retry must keep the already-open preview camera alive. A full
        // NativeLiveKit.disconnect() here stops CameraX, so the next attempt
        // visibly restarts the camera. Session-only disconnect drops the failed
        // room state but preserves previewTrack for promotePreviewToSession().
        try {
          if (typeof NativeLiveKit.disconnectSessionOnly === 'function') {
            await NativeLiveKit.disconnectSessionOnly();
          } else {
            await NativeLiveKit.disconnect();
          }
        } catch { /* noop */ }
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
    if (!isNativeLiveKitAvailable()) return { active: false, boundAtMs: 0, ageMs: 0, canHardReconnect: false } as const;
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
    if (!isNativeLiveKitAvailable()) return;
    try { await NativeLiveKit.setSurviveActivityDestroy({ enabled }); }
    catch { /* not implemented on web/iOS */ }
  }

  /**
   * Phase I — update Bigo-style LIVE foreground notification. No-op on
   * web/iOS or when broadcastMode !== 'live'. Cheap; safe per realtime tick.
   */
  async updateLiveStats(opts: { viewerCount?: number; coinCount?: number; title?: string }): Promise<void> {
    if (!isNativeLiveKitAvailable()) return;
    try { await NativeLiveKit.updateLiveStats(opts); }
    catch { /* not implemented on web/iOS */ }
  }


  async disconnect(): Promise<void> {
    this.mediaEpoch += 1;
    if (!isNativeLiveKitAvailable()) {
      this.connected = false;
      this.activeFeature = null;
      this.previewFeature = null;
      this.boundedSurfaceMode = false;
      this.busy = false;
      return;
    }
    recordCallDiag('media-epoch', 'bump', { epoch: this.mediaEpoch, reason: 'disconnect' });
    try {
      await this.waitForIdle('disconnect handoff', 5000);
    } catch (error) {
      console.warn('[NativeLiveKitController] disconnect forcing through busy native state:', error);
    }
    this.busy = true;
    try {
      try { await this.updateLiveStats({ viewerCount: 0, coinCount: 0, title: '' }); } catch { /* noop */ }
      try { await NativeLiveKit.detachAll(); } catch { /* noop */ }
      try { await NativeLiveKit.disconnect(); } catch { /* noop */ }
    } finally {
      const prevScope = this.activeFeature;
      const prevBounded = this.boundedSurfaceMode;
      this.connected = false;
      this.activeFeature = null;
      this.previewFeature = null;
      this.boundedSurfaceMode = false;
      // Do not reset this to true on disconnect. Viewer/party/private-call
      // reconnect ladders intentionally use bounded renderers; flipping the
      // flag here lets delayed camera-state events re-mount a full-screen
      // native renderer around the 10–14s window and hide React UI overlays.
      this.busy = false;
      recordCallDiag('session', 'disconnect', { scope: prevScope, bounded: prevBounded });
      recordCallDiag('native-detach', 'detachAll', { scope: prevScope });
    }
  }

  /**
   * Phase 3 — tear down ONLY the LiveKit session (Room). Preserves the local
   * preview track / renderer / preview Room so the JS retry loop can re-enter
   * `connectAndPublish` without a CameraX reopen + black flash.
   * Safe no-op on older APKs (Proxy swallows the missing method).
   */
  async disconnectSessionOnly(): Promise<void> {
    this.mediaEpoch += 1;
    if (!isNativeLiveKitAvailable()) {
      this.connected = false;
      this.activeFeature = null;
      this.boundedSurfaceMode = false;
      return;
    }
    try {
      const fn = (NativeLiveKit as unknown as { disconnectSessionOnly?: () => Promise<unknown> })
        .disconnectSessionOnly;
      if (typeof fn === 'function') {
        await fn.call(NativeLiveKit);
      } else {
        // Older APK: fall back to a full disconnect — black flash possible but
        // never hangs the retry loop.
        try { await NativeLiveKit.disconnect(); } catch { /* noop */ }
      }
    } catch (error) {
      console.warn('[NativeLiveKitController] disconnectSessionOnly failed (non-fatal):', error);
    } finally {
      this.connected = false;
      this.activeFeature = null;
      this.boundedSurfaceMode = false;
      // INTENTIONAL: leave previewFeature + autoAttachLocalRenderer untouched
      // so the preview keeps owning the camera between retries.
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
    if (!isNativeLiveKitAvailable()) return () => undefined;
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
      if (enabled && this.canAttachFullscreenLocal()) await this.attachLocalWithRetry();
    } catch (e) {
      console.warn('[NativeLiveKitController] setCameraEnabled failed:', e);
    }
  }

  async switchCamera(): Promise<void> {
    if (!this.connected) return;
    try { await NativeLiveKit.switchCamera(); } catch (e) {
      console.warn('[NativeLiveKitController] switchCamera failed:', e);
    }
  }

  // --- Pre-connect Go Live camera preview (Android only) ---------
  /**
   * Start the native prejoin camera preview behind the WebView.
   * Returns false on web/iOS, on old APKs without the method, or when
   * the camera is busy — callers should surface a friendly message.
   */
  async startLocalPreview(opts?: { lens?: Lens; resolution?: Resolution; mirror?: boolean; boundedOnly?: boolean; roomScope?: NativeRoomScope }): Promise<boolean> {
    if (!isNativeLiveKitAvailable()) return false;
    const requestedFeature = opts?.roomScope ?? null;
    const startEpoch = this.mediaEpoch;

    // T-shirt rule: if preview for this exact media family is already alive
    // (or currently opening), reuse it. Never stop/reopen Camera2 just because
    // React re-rendered, the user tapped twice, or the next phase mounted.
    if (this.previewStartPromise && (!requestedFeature || !this.previewFeature || this.previewFeature === requestedFeature)) {
      return this.previewStartPromise;
    }
    if (this.connected && this.activeFeature && requestedFeature && this.activeFeature === requestedFeature) {
      return true;
    }
    if (!this.connected && this.previewFeature && requestedFeature && this.previewFeature === requestedFeature) {
      if (!opts?.boundedOnly) await this.attachLocalWithRetry().catch(() => undefined);
      return true;
    }

    const startPromise = (async () => {
      await this.waitForIdle('startLocalPreview');
      if (startEpoch !== this.mediaEpoch) return false;
      this.busy = true;
      try {
      if (startEpoch !== this.mediaEpoch) return false;
      if (this.connected && this.activeFeature && requestedFeature && this.activeFeature !== requestedFeature) {
        throw new Error(`NativeLiveKit session already active for ${this.activeFeature}; refusing ${requestedFeature} preview`);
      }
      if (!this.connected && this.previewFeature && requestedFeature && this.previewFeature !== requestedFeature) {
        await NativeLiveKit.stopLocalPreview().catch(() => undefined);
        this.previewFeature = null;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      try {
        if (opts?.boundedOnly) {
          this.mediaEpoch += 1;
          this.boundedSurfaceMode = true;
          this.autoAttachLocalRenderer = false;
          try { await NativeLiveKit.detachLocal?.(); } catch { /* noop */ }
        } else {
          this.boundedSurfaceMode = false;
          this.autoAttachLocalRenderer = true;
        }
        await NativeLiveKit.startLocalPreview(opts ?? {});
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e ?? '');
        if (!/Preview busy|preview busy|already running|camera.*busy/i.test(message)) throw e;
        // Older APKs can reject with "Preview busy" even when the SAME
        // preview track is already running. Treat that as reuse. Stopping here
        // was the real camera reset/black-flash bug during preview→publish.
        console.warn('[NativeLiveKitController] startLocalPreview reused busy native preview:', message);
      }
      if (startEpoch !== this.mediaEpoch) {
        try { await NativeLiveKit.forceDetachAllSurfaces?.(); } catch { /* noop */ }
        try { await NativeLiveKit.detachAll?.(); } catch { /* noop */ }
        try { await NativeLiveKit.detachLocal?.(); } catch { /* noop */ }
        try { await NativeLiveKit.stopLocalPreview(); } catch { /* noop */ }
        return false;
      }
      this.previewFeature = requestedFeature;
      if (!opts?.boundedOnly && startEpoch === this.mediaEpoch) await this.attachLocalWithRetry().catch(() => undefined);
      return true;
    } catch (e) {
      console.warn('[NativeLiveKitController] startLocalPreview failed:', e);
      return false;
    } finally {
      this.busy = false;
      if (this.previewStartPromise === startPromise) this.previewStartPromise = null;
    }
    })();

    this.previewStartPromise = startPromise;
    return startPromise;
  }

  /** Stop the prejoin preview and release the camera. Always safe. */
  async stopLocalPreview(): Promise<void> {
    this.mediaEpoch += 1;
    if (!isNativeLiveKitAvailable()) {
      this.previewStartPromise = null;
      this.previewFeature = null;
      this.boundedSurfaceMode = false;
      this.busy = false;
      return;
    }
    // The visible fullscreen TextureView must disappear immediately when the
    // host leaves Go Live preview. Do not wait for an in-flight Camera2 start;
    // otherwise the native surface can remain above the next React page while
    // the user is already navigating around the app.
    try { await NativeLiveKit.forceDetachAllSurfaces?.(); } catch { /* old APK */ }
    try { await NativeLiveKit.detachAll?.(); } catch { /* old APK */ }
    try { await NativeLiveKit.detachLocal?.(); } catch { /* no preview / old APK */ }
    const pending = this.previewStartPromise;
    if (pending) await pending.catch(() => false);
    try { await NativeLiveKit.stopLocalPreview(); } catch { /* no preview / not implemented */ }
    try { await NativeLiveKit.forceDetachAllSurfaces?.(); } catch { /* detach any late bounded/fullscreen renderer */ }
    try { await NativeLiveKit.detachAll?.(); } catch { /* detach any late bounded renderer */ }
    try { await NativeLiveKit.detachLocal?.(); } catch { /* detach any late renderer */ }
    this.previewFeature = null;
    this.boundedSurfaceMode = false;
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
      if (this.connected && this.autoAttachLocalRenderer) await this.attachLocalWithRetry();
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
