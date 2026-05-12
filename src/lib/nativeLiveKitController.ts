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
import { NativeLiveKit, type ConnectOptions, type Lens, type Resolution, type AudioDeviceType, type NativeAudioDevice } from '@/plugins/NativeLiveKit';

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
        callerName: opts.callerName,
        callType: opts.callType,
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

  // --- Audio device routing (Step 13) ----------------------------
  async getAudioDevices(): Promise<{ active: AudioDeviceType; devices: NativeAudioDevice[] }> {
    try { return await NativeLiveKit.getAudioDevices(); }
    catch { return { active: 'unknown', devices: [] }; }
  }

  async setAudioDevice(type: AudioDeviceType): Promise<boolean> {
    try { const r = await NativeLiveKit.setAudioDevice({ type }); return r.applied; }
    catch (e) { console.warn('[NativeLiveKitController] setAudioDevice failed:', e); return false; }
  }
}

export const nativeLiveKitController = new NativeLiveKitController();
