/**
 * Pkg197 — Pre-connect audio buffer (LiveKit v2.15+)
 *
 * Lets you start capturing microphone audio BEFORE `room.connect()` resolves,
 * so the very first words a user speaks (e.g. into a voice agent / SIP / call)
 * are never lost during ICE/DTLS handshake.
 *
 * Internally this enables `preConnectBuffer: true` on `setMicrophoneEnabled`.
 * livekit-client buffers PCM locally and auto-flushes it as soon as the
 * publish path is ready (fires `TrackEvent.PreConnectBufferFlushed`).
 *
 * Usage (in any pre-join screen, before you call `room.connect(...)`):
 *
 *   const pre = await startPreConnectAudio(room);   // mic on, buffering
 *   await room.connect(url, token);                 // buffer auto-flushes
 *   pre?.onFlushed(() => console.log('buffer drained'));
 *
 * Safe to call repeatedly; safe to call without ever connecting (just mutes).
 * Zero behaviour change for existing flows that don't call this.
 */

import {
  Room,
  TrackEvent,
  type LocalAudioTrack,
  type AudioCaptureOptions,
} from 'livekit-client';

export interface PreConnectAudioHandle {
  /** The local mic track that's buffering audio. */
  track: LocalAudioTrack | undefined;
  /** Subscribe to the one-shot flush event (fires once after connect). */
  onFlushed: (cb: (chunkCount: number) => void) => () => void;
  /** Stop capture without ever connecting (also cancels the buffer). */
  cancel: () => Promise<void>;
}

/**
 * Start microphone capture with pre-connect buffering enabled.
 * Must be called BEFORE `room.connect()` — calling it after connect is a no-op
 * for buffering (mic still turns on normally).
 *
 * @param room       a freshly created Room (not yet connected)
 * @param audioOpts  optional override of capture constraints (echoCancellation, etc.)
 */
export async function startPreConnectAudio(
  room: Room,
  audioOpts?: AudioCaptureOptions,
): Promise<PreConnectAudioHandle | null> {
  try {
    const lp = room.localParticipant;
    if (!lp) return null;

    // 3rd arg is RoomConnectOptions-style; preConnectBuffer:true tells the SDK
    // to start the media pipeline and stash chunks until WebRTC is ready.
    const pub = await lp.setMicrophoneEnabled(true, audioOpts, {
      preConnectBuffer: true,
    } as any);

    const track = pub?.track as LocalAudioTrack | undefined;

    const onFlushed: PreConnectAudioHandle['onFlushed'] = (cb) => {
      if (!track) return () => {};
      const handler = (buf: Uint8Array[]) => {
        try { cb(buf?.length ?? 0); } catch { /* swallow */ }
      };
      track.on(TrackEvent.PreConnectBufferFlushed, handler);
      return () => {
        try { track.off(TrackEvent.PreConnectBufferFlushed, handler); } catch { /* */ }
      };
    };

    const cancel = async () => {
      try { await lp.setMicrophoneEnabled(false); } catch { /* */ }
    };

    return { track, onFlushed, cancel };
  } catch (err) {
    console.warn('[Pkg197] startPreConnectAudio failed:', err);
    return null;
  }
}

/**
 * Convenience helper: prepare TCP/TLS to the SFU in parallel with mic capture.
 * Call this on a pre-join screen so by the time the user taps "Join", both
 * the socket warm-up AND the first audio chunks are already in flight.
 */
export async function warmupAndCaptureAudio(
  room: Room,
  url: string,
  token: string | undefined,
  audioOpts?: AudioCaptureOptions,
): Promise<PreConnectAudioHandle | null> {
  // Fire both concurrently; ignore prepareConnection failures (best-effort).
  const warm = room.prepareConnection(url, token).catch((e) => {
    console.warn('[Pkg197] prepareConnection failed:', e);
  });
  const handle = await startPreConnectAudio(room, audioOpts);
  await warm;
  return handle;
}
