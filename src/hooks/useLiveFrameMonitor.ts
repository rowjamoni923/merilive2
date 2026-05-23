import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface FrameMonitorResponse {
  ok: boolean;
  severity?: 'ok' | 'warning' | 'critical';
  action?: 'end_stream' | null;
  result?: {
    alerts?: string[];
    face_present?: boolean;
    face_count?: number;
    nsfw_score?: number;
    violence_score?: number;
    weapons_detected?: boolean;
    drugs_detected?: boolean;
    identity_match?: boolean;
  };
  strikes?: number;
}

interface Options {
  /** When false, monitor is suspended. */
  enabled: boolean;
  /** The host's profile id (used as external_user_id on the provider). */
  userId: string | null | undefined;
  /** LiveKit/raw MediaStreamTrack — null/undefined will pause capture. */
  track: MediaStreamTrack | null | undefined;
  /** Logical context for admin dashboard filtering. */
  context?: 'live_stream' | 'party_room' | 'call';
  /** Room or stream id passed through to the alert payload. */
  roomId?: string | null;
  streamId?: string | null;
  /** Capture interval in ms — defaults 15s (Bigo-grade cadence). */
  intervalMs?: number;
  /** Frame max width in px — defaults 320 (compact for fast upload). */
  maxWidth?: number;
  /** Called whenever the provider returns severity='warning'. */
  onWarning?: (resp: FrameMonitorResponse) => void;
  /** Called whenever the provider returns severity='critical'. */
  onCritical?: (resp: FrameMonitorResponse) => void;
  /**
   * Called when the server signals action:'end_stream' (3+ critical strikes
   * inside 5min, or identity_mismatch). Host should tear the stream down.
   */
  onForceEnd?: (resp: FrameMonitorResponse) => void;
}

/**
 * Periodically samples one frame from a live MediaStreamTrack, encodes it
 * as a small JPEG, and POSTs to the `live-frame-monitor` edge function.
 *
 * Safe-by-default:
 *  - All work is best-effort; failures are swallowed (never throws to UI).
 *  - Tab hidden ⇒ capture is skipped that tick (saves bandwidth/battery).
 *  - Page unmount / track disabled ⇒ interval cleared and refs released.
 */
export function useLiveFrameMonitor({
  enabled,
  userId,
  track,
  context = 'live_stream',
  roomId = null,
  streamId = null,
  intervalMs = 15_000,
  maxWidth = 320,
  onWarning,
  onCritical,
  onForceEnd,
}: Options): void {
  const inFlightRef = useRef(false);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  // Latest callbacks captured in a ref so they can change without resetting
  // the interval (which would skip ticks during re-renders).
  const cbRef = useRef({ onWarning, onCritical, onForceEnd });
  cbRef.current = { onWarning, onCritical, onForceEnd };

  useEffect(() => {
    if (!enabled || !userId || !track) return;

    let cancelled = false;

    // Hidden video element to read frames from the track.
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = new MediaStream([track]);
    videoElRef.current = video;

    const canvas = document.createElement('canvas');

    const captureOnce = async () => {
      if (cancelled || inFlightRef.current) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      if (track.readyState !== 'live' || !track.enabled) return;
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return;

      inFlightRef.current = true;
      try {
        const scale = Math.min(1, maxWidth / w);
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        const imageBase64 = dataUrl.split(',')[1] ?? '';
        if (!imageBase64) return;

        const { data, error } = await supabase.functions.invoke<FrameMonitorResponse>(
          'live-frame-monitor',
          { body: { userId, imageBase64, context, roomId, streamId } },
        );
        if (cancelled || error || !data) return;

        if (data.severity === 'critical') cbRef.current.onCritical?.(data);
        else if (data.severity === 'warning') cbRef.current.onWarning?.(data);

        if (data.action === 'end_stream') cbRef.current.onForceEnd?.(data);
      } catch (e) {
        // best-effort — never surface
        if (import.meta.env.DEV) console.warn('[useLiveFrameMonitor] tick failed', e);
      } finally {
        inFlightRef.current = false;
      }
    };

    // Start playback (some browsers need explicit play()).
    void video.play().catch(() => undefined);

    // First capture after ~5s grace so the video is warmed up, then on interval.
    const firstTimer = window.setTimeout(captureOnce, 5_000);
    const interval = window.setInterval(captureOnce, intervalMs);

    return () => {
      cancelled = true;
      window.clearTimeout(firstTimer);
      window.clearInterval(interval);
      try {
        video.pause();
        video.srcObject = null;
      } catch { /* noop */ }
      videoElRef.current = null;
    };
  }, [enabled, userId, track, context, roomId, streamId, intervalMs, maxWidth]);
}
