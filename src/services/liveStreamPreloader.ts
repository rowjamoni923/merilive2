/**
 * Live Stream Preloader v3 — Pre-connects to ALL live rooms in the background
 * so viewers see running video INSTANTLY on click (zero loading).
 *
 * Architecture:
 * 1. On the Live listing page, we pre-connect to ALL rooms as "hidden viewers"
 *    (hidden=true token — NOT counted in viewer count)
 * 2. We cache the Room + remote video Track in memory
 * 3. When user clicks a stream, LiveStream.tsx consumes the cached room/track
 * 4. If no cache hit, falls back to normal join flow
 *
 * Performance safeguards:
 * - Connections are staggered (200ms apart) to avoid bandwidth spikes
 * - Auto-disconnect after 60s if not consumed
 * - Rooms are disconnected on page leave
 * - Hidden tokens = zero viewer count impact
 */
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
} from 'livekit-client';
import { getLiveKitToken } from '@/services/livekitService';
import { connectLiveKitRoom } from '@/lib/livekitConnectPolicy';

const PRELOAD_TTL_MS = 60_000; // auto-disconnect after 60s if unused
const STAGGER_DELAY_MS = 200; // delay between each connection to avoid spikes
const HANDOFF_GRACE_MS = 5_000; // keep clicked stream alive while route changes

interface PreloadedStream {
  room: Room;
  streamId: string;
  videoTrack: RemoteTrack | null;
  audioTrack: RemoteTrack | null;
  participant: RemoteParticipant | null;
  createdAt: number;
  ttlTimer: ReturnType<typeof setTimeout>;
}

const preloadedStreams = new Map<string, PreloadedStream>();
let _preloadEnabled = false;
let handoffStreamId: string | null = null;
let handoffExpiresAt = 0;

export function markPreloadedStreamForHandoff(streamId: string): void {
  handoffStreamId = streamId;
  handoffExpiresAt = Date.now() + HANDOFF_GRACE_MS;
}

/**
 * Consume a preloaded stream (removes from cache, caller owns the Room now).
 * Returns null if no preloaded stream exists for this id.
 */
export async function consumePreloadedStream(streamId: string): Promise<{
  room: Room;
  videoTrack: RemoteTrack | null;
  audioTrack: RemoteTrack | null;
  participant: RemoteParticipant | null;
} | null> {
  const entry = preloadedStreams.get(streamId);
  if (!entry) return null;

  clearTimeout(entry.ttlTimer);
  preloadedStreams.delete(streamId);
  if (handoffStreamId === streamId) {
    handoffStreamId = null;
    handoffExpiresAt = 0;
  }

  // Phase 2B Step 8 (M1 fix): if room is connected but TrackSubscribed hasn't
  // fired yet (stagger delay + slow host), wait up to 300ms before declaring
  // the preload unusable. Previously we discarded too eagerly → cold-fallback.
  if (entry.room.state === ConnectionState.Connected && !entry.videoTrack) {
    const deadline = Date.now() + 300;
    while (Date.now() < deadline && !entry.videoTrack) {
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  // Only return if still connected and has video
  if (entry.room.state === ConnectionState.Connected && entry.videoTrack) {
    console.log(`[Preloader] ✅ Consumed preloaded stream: ${streamId}`);
    return {
      room: entry.room,
      videoTrack: entry.videoTrack,
      audioTrack: entry.audioTrack,
      participant: entry.participant,
    };
  }

  // Not usable — disconnect and return null
  try { entry.room.disconnect(true); } catch {}
  console.log(`[Preloader] ⚠️ Preloaded stream not ready, discarding: ${streamId}`);
  return null;
}

/**
 * Check if a stream is preloaded and has a video track ready
 */
export function isStreamPreloaded(streamId: string): boolean {
  const entry = preloadedStreams.get(streamId);
  return Boolean(entry && entry.room.state === ConnectionState.Connected && entry.videoTrack);
}

/**
 * Preload a single stream in background (non-blocking).
 * Uses hidden=true token so it does NOT count as a viewer.
 * Safe to call multiple times for the same streamId.
 */
export async function preloadStream(streamId: string): Promise<void> {
  if (preloadedStreams.has(streamId)) return;
  if (!_preloadEnabled) return;

  const roomName = `live_${streamId}`;

  try {
    const room = new Room({
      // Phase 2B Step 8 (M2 fix): enable adaptiveStream + dynacast so the SFU
      // pauses unused layers during preload (no element attached → smallest
      // layer or paused). On handoff, the viewer's element attach naturally
      // promotes to HIGH. Previously both were false → preloaded paths never
      // benefited from server-side layer pausing.
      adaptiveStream: true,
      dynacast: true,
      // T-shirt rule: one connect per viewer session. Drop = end. New tap = new connect.
      reconnectPolicy: {
        nextRetryDelayInMs: () => null,
      },
      disconnectOnPageLeave: false,
    });

    const entry: PreloadedStream = {
      room,
      streamId,
      videoTrack: null,
      audioTrack: null,
      participant: null,
      createdAt: Date.now(),
      ttlTimer: setTimeout(() => {
        console.log(`[Preloader] ⏰ TTL expired for ${streamId}, disconnecting`);
        try { room.disconnect(true); } catch {}
        preloadedStreams.delete(streamId);
      }, PRELOAD_TTL_MS),
    };

    // Track subscription handler
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind === Track.Kind.Video && !entry.videoTrack) {
        entry.videoTrack = track;
        entry.participant = participant;
        console.log(`[Preloader] 🎥 Video track ready for ${streamId}`);
      }
      if (track.kind === Track.Kind.Audio && !entry.audioTrack) {
        entry.audioTrack = track;
        // Mute preloaded audio (user hasn't clicked yet)
        try {
          const el = track.attach();
          el.muted = true;
          el.volume = 0;
        } catch {}
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      clearTimeout(entry.ttlTimer);
      preloadedStreams.delete(streamId);
    });

    // Store entry before connecting (so duplicate calls are blocked)
    preloadedStreams.set(streamId, entry);

    // Get HIDDEN token (won't count as viewer)
    const { token, url } = await getLiveKitToken(roomName, 'viewer_stream', undefined, true);
    
    if (!_preloadEnabled) {
      // Cleanup was called while we were fetching token
      preloadedStreams.delete(streamId);
      return;
    }

    await room.prepareConnection(url, token).catch(() => {});
    await connectLiveKitRoom(room, url, token, 'preload');

    // Force-subscribe to existing participants
    room.remoteParticipants.forEach((p) => {
      p.trackPublications.forEach((pub) => {
        if (!pub.isSubscribed) {
          try { pub.setSubscribed(true); } catch {}
        }
      });
    });

    console.log(`[Preloader] ✅ Pre-connected to ${streamId} (hidden, no viewer count)`);
  } catch (err) {
    console.warn(`[Preloader] Failed to preload ${streamId}:`, err);
    preloadedStreams.delete(streamId);
  }
}

/**
 * Preload ALL streams from a list of stream IDs.
 * Connections are staggered to avoid bandwidth spikes.
 * Call from Live.tsx after fetching active streams.
 */
export function preloadAllStreams(streamIds: string[]): void {
  _preloadEnabled = true;
  
  // Stagger connections to avoid bandwidth spike
  streamIds.forEach((id, index) => {
    setTimeout(() => {
      if (_preloadEnabled) {
        preloadStream(id).catch(() => {});
      }
    }, index * STAGGER_DELAY_MS);
  });
}

// Keep backward compat
export function preloadTopStreams(streamIds: string[]): void {
  preloadAllStreams(streamIds);
}

/**
 * Disconnect and cleanup ALL preloaded streams.
 * Call when leaving the Live listing page.
 */
export function cleanupAllPreloaded(): void {
  _preloadEnabled = false;
  const keepHandoff = handoffStreamId && handoffExpiresAt > Date.now() ? handoffStreamId : null;
  preloadedStreams.forEach((entry) => {
    if (entry.streamId === keepHandoff) return;
    clearTimeout(entry.ttlTimer);
    try { entry.room.disconnect(true); } catch {}
    preloadedStreams.delete(entry.streamId);
  });
  if (!keepHandoff) {
    preloadedStreams.clear();
    handoffStreamId = null;
    handoffExpiresAt = 0;
  }
  console.log('[Preloader] 🧹 All preloaded streams cleaned up');
}

/**
 * Get count of currently preloaded streams
 */
export function getPreloadedCount(): number {
  return preloadedStreams.size;
}
