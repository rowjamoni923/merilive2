/**
 * nativeLiveKitController — imperative singleton wrapper around the
 * NativeLiveKit Capacitor plugin.
 *
 * Hooks (useAgoraClient / useAgoraCall) call this from join/leave paths
 * when `shouldUseNativeLiveKit()` is true, so the native Android publish
 * path replaces the web `livekit-client` Room.connect() flow.
 *
 * On web/iOS the controller is never invoked (gate returns false), and
 * all calls are still safe no-ops because the underlying plugin returns
 * "not implemented" which we swallow.
 */
import { NativeLiveKit, type ConnectOptions, type Lens, type Resolution } from '@/plugins/NativeLiveKit';

export interface NativeJoinOptions {
  url: string;
  token: string;
  video?: boolean;
  audio?: boolean;
  lens?: Lens;
  resolution?: Resolution;
  /** Show local preview surface immediately after connect. Default true for hosts. */
  attachLocal?: boolean;
}

class NativeLiveKitController {
  private connected = false;
  private busy = false;

  isConnected() {
    return this.connected;
  }

  async connectAndPublish(opts: NativeJoinOptions): Promise<{ sid: string; identity: string }> {
    if (this.busy) throw new Error('NativeLiveKit: previous connect/disconnect still in flight');
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
      };

      const res = await NativeLiveKit.connect(payload);
      this.connected = true;

      if (opts.attachLocal !== false) {
        try { await NativeLiveKit.attachLocal(); } catch (e) {
          console.warn('[NativeLiveKitController] attachLocal failed:', e);
        }
      }

      return { sid: res.sid, identity: res.identity };
    } finally {
      this.busy = false;
    }
  }

  async disconnect(): Promise<void> {
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
}

export const nativeLiveKitController = new NativeLiveKitController();
