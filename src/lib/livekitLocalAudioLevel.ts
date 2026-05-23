/**
 * Pkg203 — Local mic VU meter (M6).
 *
 * Pre-join already shows a mic level bar (PreJoinDevicesDialog).
 * In-room there was no "is my mic actually picking up sound?" affordance
 * for hosts / seated party users.
 *
 * This module exposes a `useLocalMicLevel(scope, id)` hook that reads
 * `room.localParticipant.audioLevel` (already maintained by LiveKit when
 * the mic track is published) via a RAF loop. No new AudioContext, no
 * extra analyser — zero CPU when no mic is published.
 *
 * Also exposes `useMediaStreamMicLevel(stream)` for the standalone case
 * (e.g. a custom pre-join screen that has its own MediaStream).
 *
 * Pure read-only — no Supabase, no polling, $1400-rule safe.
 */

import { useEffect, useRef, useState } from 'react';
import { _getRegisteredRoom, type StreamScope } from './livekitStreams';

/**
 * Returns a smoothed mic level in [0, 1] for the local participant of a
 * registered Room (Pkg121 registry). Returns 0 when no mic track is
 * currently published.
 *
 * Optional `smoothing` is an exponential factor (0 = no smoothing,
 * 1 = freeze). Default 0.6 gives a pleasant decay.
 */
export function useLocalMicLevel(
  scope: StreamScope,
  id: string,
  smoothing = 0.6,
): number {
  const [level, setLevel] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const smooth = Math.max(0, Math.min(0.95, smoothing));

    const tick = () => {
      if (cancelled) return;
      const room = _getRegisteredRoom(scope, id);
      const raw = room?.localParticipant?.audioLevel ?? 0;
      // Light exponential smoothing so the bar decays naturally.
      const next = lastRef.current * smooth + raw * (1 - smooth);
      lastRef.current = next;
      // Only push to React when the delta is visible (saves re-renders).
      setLevel((prev) => (Math.abs(prev - next) > 0.01 ? next : prev));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastRef.current = 0;
    };
  }, [scope, id, smoothing]);

  return level;
}

/**
 * Returns a smoothed mic level in [0, 1] for an arbitrary MediaStream
 * (e.g. a pre-join preview stream). Uses Web Audio API.
 *
 * Pass `null` to fully stop the analyser and release the AudioContext.
 */
export function useMediaStreamMicLevel(
  stream: MediaStream | null,
  smoothing = 0.6,
): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream) {
      setLevel(0);
      return;
    }
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setLevel(0);
      return;
    }

    let ctx: AudioContext | null = null;
    let src: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let buf: Uint8Array | null = null;
    let raf: number | null = null;
    let cancelled = false;
    let last = 0;
    const smooth = Math.max(0, Math.min(0.95, smoothing));

    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      buf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      src.connect(analyser);
    } catch (err) {
      console.warn('[useMediaStreamMicLevel] init failed', err);
      return;
    }

    const tick = () => {
      if (cancelled || !analyser || !buf) return;
      analyser.getByteTimeDomainData(buf);
      // RMS over the waveform, normalised to [0, 1].
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      // Boost a bit — RMS rarely goes above ~0.3 for speech.
      const norm = Math.min(1, rms * 2.8);
      const next = last * smooth + norm * (1 - smooth);
      last = next;
      setLevel((prev) => (Math.abs(prev - next) > 0.01 ? next : prev));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (raf != null) cancelAnimationFrame(raf);
      try {
        src?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        analyser?.disconnect();
      } catch {
        /* ignore */
      }
      ctx?.close().catch(() => {});
      ctx = null;
      src = null;
      analyser = null;
      buf = null;
    };
  }, [stream, smoothing]);

  return level;
}
