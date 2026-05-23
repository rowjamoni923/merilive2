/**
 * Pkg205 — Device-aware backup-codec selection (M3).
 *
 * The 4 connect sites currently hard-code `videoCodec: 'vp9'` with
 * `backupCodec: { codec: 'vp8' }`. That's fine on Android Chrome and
 * modern desktops — but on iOS Safari, old iPads, and low-end Androids,
 * VP9 has no hardware decoder, and VP8 hardware support is also spotty.
 * The result on those devices: high CPU, dropped frames, hot battery.
 *
 * This module exposes a tiny `pickOptimalCodecs()` helper that inspects
 * the runtime and returns the best `{ videoCodec, backupCodec }` pair
 * for the current user agent. Callers can spread it straight into
 * `publishDefaults`:
 *
 *   const codecs = pickOptimalCodecs();
 *   new Room({
 *     publishDefaults: { ...rest, ...codecs },
 *   });
 *
 * Decision matrix (priority: hardware decode > visual quality at bitrate):
 *  - iOS Safari (any iPhone/iPad)         → H.264 primary, no backup
 *  - Desktop Safari                        → H.264 primary, no backup
 *  - Android Chrome with AV1 hw            → AV1   primary, H.264 backup
 *  - Modern desktop Chrome/Edge with AV1   → AV1   primary, H.264 backup
 *  - Other Chromium / Firefox              → VP9   primary, H.264 backup
 *
 * H.264 backup is preferred over VP8 because H.264 has the broadest
 * hardware-decode coverage on the receiver side (older Android, smart
 * TVs, embedded WebViews).
 *
 * Pure feature-detection — no Supabase, no Room dep, no polling.
 * $1400-rule safe.
 */

import type { VideoCodec } from 'livekit-client';

export type CodecChoice = {
  videoCodec: VideoCodec;
  /**
   * `backupCodec: true` lets LiveKit pick H.264 automatically; we name
   * it explicitly so the decision is auditable in logs.
   */
  backupCodec?: { codec: VideoCodec };
  backupCodecPolicy?: number;
};

// ─── Platform sniff (cheap, deterministic) ────────────────────────────────

function ua(): string {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}

function isIOS(): boolean {
  const u = ua();
  // iPadOS 13+ reports as Mac but supports touch.
  if (/iPad|iPhone|iPod/i.test(u)) return true;
  if (
    typeof navigator !== 'undefined' &&
    /Macintosh/i.test(u) &&
    (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints &&
    (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1
  ) {
    return true;
  }
  return false;
}

function isSafari(): boolean {
  const u = ua();
  return /Safari/i.test(u) && !/Chrome|Chromium|CriOS|FxiOS|Edg/i.test(u);
}

function isFirefox(): boolean {
  return /Firefox|FxiOS/i.test(ua());
}

// ─── Codec capability probes ──────────────────────────────────────────────

/**
 * Detect whether the browser can ENCODE a given video codec for sending.
 * Uses the static `RTCRtpSender.getCapabilities('video')` table — does
 * not start any media.
 */
export function canEncode(mime: string): boolean {
  try {
    const RtpSender = (window as unknown as { RTCRtpSender?: typeof RTCRtpSender }).RTCRtpSender;
    if (!RtpSender || typeof RtpSender.getCapabilities !== 'function') return false;
    const caps = RtpSender.getCapabilities('video');
    if (!caps) return false;
    return caps.codecs.some((c) => c.mimeType.toLowerCase() === mime.toLowerCase());
  } catch {
    return false;
  }
}

export function supportsAV1Encode(): boolean {
  return canEncode('video/AV1');
}

export function supportsVP9Encode(): boolean {
  return canEncode('video/VP9');
}

export function supportsH264Encode(): boolean {
  return canEncode('video/H264');
}

// ─── Decision ─────────────────────────────────────────────────────────────

export interface PickOptions {
  /** Force a specific primary codec (skips device sniff). */
  prefer?: VideoCodec;
  /**
   * When true, prefer H.264 backup over VP8 (default true). H.264 has
   * wider hardware decode coverage on the receiver side.
   */
  preferH264Backup?: boolean;
  /**
   * Override for tests / power users.
   */
  forcePlatform?: 'ios' | 'safari-desktop' | 'chromium' | 'firefox';
}

export function pickOptimalCodecs(opts: PickOptions = {}): CodecChoice {
  const preferH264 = opts.preferH264Backup !== false;
  const h264Available = supportsH264Encode();
  const vp8Backup: CodecChoice['backupCodec'] = { codec: 'vp8' };
  const h264Backup: CodecChoice['backupCodec'] = h264Available
    ? { codec: 'h264' }
    : vp8Backup;
  const chosenBackup = preferH264 ? h264Backup : vp8Backup;

  // 1. Explicit override.
  if (opts.prefer) {
    return {
      videoCodec: opts.prefer,
      backupCodec: opts.prefer === 'h264' ? undefined : chosenBackup,
    };
  }

  const platform =
    opts.forcePlatform ??
    (isIOS()
      ? 'ios'
      : isSafari()
      ? 'safari-desktop'
      : isFirefox()
      ? 'firefox'
      : 'chromium');

  // 2. iOS / desktop Safari → H.264 primary. No backup needed; H.264 IS
  //    the universally supported floor.
  if (platform === 'ios' || platform === 'safari-desktop') {
    return { videoCodec: 'h264' };
  }

  // 3. Firefox → VP9 primary (Firefox AV1 encode is gated/unstable in
  //    WebRTC as of 2026), H.264 backup.
  if (platform === 'firefox') {
    if (supportsVP9Encode()) return { videoCodec: 'vp9', backupCodec: chosenBackup };
    return { videoCodec: 'h264' };
  }

  // 4. Chromium → prefer AV1 if encoder is available (Chrome 124+ with
  //    hardware support on modern Intel/AMD/Apple Silicon), else VP9.
  if (supportsAV1Encode()) {
    return { videoCodec: 'av1', backupCodec: chosenBackup };
  }
  if (supportsVP9Encode()) {
    return { videoCodec: 'vp9', backupCodec: chosenBackup };
  }
  return { videoCodec: 'h264' };
}

/**
 * Lightweight one-line summary for diagnostic logs.
 *   "primary=vp9 backup=h264 (chromium)"
 */
export function describeCodecChoice(choice: CodecChoice): string {
  const backup = choice.backupCodec ? choice.backupCodec.codec : 'none';
  return `primary=${choice.videoCodec} backup=${backup}`;
}
