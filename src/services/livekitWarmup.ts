/**
 * LiveKit Warmup — Phase 2 of instant-entry architecture.
 *
 * Lightweight DNS+TLS pre-warm for rooms visible in the viewport. Uses the
 * cached wildcard viewer token (Phase 1) so it costs zero token-fetches.
 *
 * NOT a full preconnect: no signaling Join, no SDP exchange, no media. Just
 * `Room.prepareConnection(url, token)` which:
 *   - resolves the LiveKit URL DNS
 *   - completes TLS handshake (cached for ~10min by OS/browser)
 *
 * This shaves 150-300ms off the tap-to-first-frame critical path.
 *
 * Heavy media preload (full Room.connect + subscribe) stays in
 * liveStreamPreloader.ts — that is intentionally a separate, costlier tier
 * used only for top live tiles. This warmup is cheap and runs for every
 * visible tile.
 *
 * Lifecycle:
 *   - warm(roomName)    idempotent; creates+prepares a throwaway Room
 *   - auto-discard after 30s if not consumed
 *   - cancel(roomName)  drops it immediately (e.g. on page leave)
 */
import { Room } from "livekit-client";
import { livekitTokenCache } from "@/services/livekitTokenCache";

const DISCARD_AFTER_MS = 30_000;

interface WarmedEntry {
  room: Room;
  warmedAtMs: number;
  discardTimer: ReturnType<typeof setTimeout>;
}

const warmed = new Map<string, WarmedEntry>();

const drop = (key: string) => {
  const e = warmed.get(key);
  if (!e) return;
  clearTimeout(e.discardTimer);
  try {
    void e.room.disconnect(true);
  } catch {
    /* noop */
  }
  warmed.delete(key);
};

/**
 * Pre-warm DNS + TLS for a LiveKit room. Safe to call repeatedly. No-op if
 * already warmed within DISCARD_AFTER_MS, or if no wildcard viewer token
 * is available yet (will be retried by the caller's next viewport event).
 */
export const warmLiveKitRoom = (roomName: string): void => {
  if (!roomName) return;
  if (warmed.has(roomName)) return;

  const tokenEntry = livekitTokenCache.getCached();
  if (!tokenEntry) {
    // No cached wildcard token yet — kick off a fetch (non-blocking) so the
    // next viewport tick succeeds. Don't warm without a token; would need
    // per-room mint which defeats the point of this phase.
    void livekitTokenCache.refresh();
    return;
  }

  let room: Room;
  try {
    room = new Room({
      adaptiveStream: true,
      // Phase 5 will swap this for ConnectionPool acquire(); for Phase 2
      // it's a fresh throwaway Room used only for prepareConnection.
      reconnectPolicy: { nextRetryDelayInMs: () => null },
    });
  } catch {
    return;
  }

  const entry: WarmedEntry = {
    room,
    warmedAtMs: Date.now(),
    discardTimer: setTimeout(() => drop(roomName), DISCARD_AFTER_MS),
  };
  warmed.set(roomName, entry);

  // prepareConnection does DNS resolution + TLS handshake + (on LiveKit
  // Cloud) edge-region pick. Cheap, non-billable, no media flow.
  // Self-hosted: still saves DNS + TLS (~150-300ms on first tap).
  room.prepareConnection(tokenEntry.url, tokenEntry.token).catch(() => {
    drop(roomName);
  });
};

/** Manually cancel a warmup (e.g. user scrolled away long ago). */
export const cancelLiveKitWarmup = (roomName: string): void => {
  drop(roomName);
};

/** Clear all warmups — call on app background / route change away from feed. */
export const cancelAllLiveKitWarmups = (): void => {
  for (const key of Array.from(warmed.keys())) drop(key);
};

/** Debug helper: count of currently warmed entries. */
export const getWarmedCount = (): number => warmed.size;
