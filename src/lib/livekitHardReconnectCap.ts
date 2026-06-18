/**
 * X1 — 20-Minute Hard Reconnect Cap.
 *
 * Industry-standard pattern (Agora / Zoom / Bigo / Chamet): when a session
 * has been in a disconnected/reconnecting state continuously for the
 * configured cap (default 20 minutes), the SDK stops retrying, fully
 * disconnects the room, and surfaces an "abandoned" event so the UI can
 * show a "Connection lost — please rejoin" prompt instead of spinning
 * forever.
 *
 * Centralized so live streaming, private call, and party room all share
 * the same behavior — zero new Supabase channels, zero polls.
 *
 * Lifecycle:
 *   - armOnDisconnect(scope, id, room)         → start the 20-min timer
 *   - disarmOnReconnect(scope, id)             → clear the timer
 *   - unregisterHardReconnectCap(scope, id)    → full cleanup on unmount
 *
 * On abandon:
 *   - clears its own timer
 *   - dispatches CustomEvent('livekit-reconnect-abandoned', { scope, id, durationMs })
 *   - calls room.disconnect(true) so the SDK truly stops retrying
 */
import { Room, RoomEvent, ConnectionState } from 'livekit-client';
import type { QualityScope } from './livekitConnectionQuality';

const DEFAULT_CAP_MS = 20 * 60 * 1000; // 20 minutes

interface Entry {
  scope: QualityScope;
  id: string;
  room: Room;
  capMs: number;
  /** Timestamp of the first disconnect that started the current arm window. */
  armedAt: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  stateHandler: () => void;
  abandoned: boolean;
}

const registry = new Map<string, Entry>();
const key = (scope: QualityScope, id: string) => `${scope}_${id}`;

function dispatchAbandoned(scope: QualityScope, id: string, durationMs: number) {
  try {
    window.dispatchEvent(
      new CustomEvent('livekit-reconnect-abandoned', {
        detail: { scope, id, durationMs },
      }),
    );
  } catch {
    /* swallow — SSR / non-browser env */
  }
}

function abandon(entry: Entry) {
  if (entry.abandoned) return;
  entry.abandoned = true;
  const durationMs = entry.armedAt ? Date.now() - entry.armedAt : entry.capMs;
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  console.warn(
    `[HardReconnectCap] Giving up on ${entry.scope}:${entry.id} after ${Math.round(
      durationMs / 1000,
    )}s — disconnecting room.`,
  );
  dispatchAbandoned(entry.scope, entry.id, durationMs);
  try {
    entry.room.disconnect(true);
  } catch {
    /* room may already be torn down */
  }
}

function arm(entry: Entry) {
  if (entry.timer || entry.abandoned) return;
  entry.armedAt = Date.now();
  entry.timer = setTimeout(() => abandon(entry), entry.capMs);
}

function disarm(entry: Entry) {
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  entry.armedAt = null;
}

/**
 * Register a room for the hard-reconnect cap. Listens to ConnectionStateChanged
 * and arms/disarms the timer automatically. Safe to call multiple times — the
 * latest call wins.
 */
export function registerHardReconnectCap(
  scope: QualityScope,
  id: string,
  room: Room,
  capMs: number = DEFAULT_CAP_MS,
): void {
  const k = key(scope, id);
  const existing = registry.get(k);
  if (existing) {
    if (existing.room === room) return;
    unregisterHardReconnectCap(scope, id);
  }

  const entry: Entry = {
    scope,
    id,
    room,
    capMs,
    armedAt: null,
    timer: null,
    abandoned: false,
    stateHandler: () => {
      const state = room.state;
      if (state === ConnectionState.Reconnecting || state === ConnectionState.Disconnected) {
        // Only arm on Disconnected if it came from a reconnect loop, not a
        // clean user-initiated disconnect. We arm in both cases because the
        // unregister path is the explicit "user closed" signal.
        if (!entry.timer && !entry.abandoned) arm(entry);
      } else if (state === ConnectionState.Connected) {
        disarm(entry);
      }
    },
  };

  room.on(RoomEvent.ConnectionStateChanged, entry.stateHandler);
  registry.set(k, entry);
  // Prime immediately in case we attach mid-reconnect.
  entry.stateHandler();
}

/** Explicitly arm the timer (e.g. on RoomEvent.Reconnecting). */
export function armHardReconnectCap(scope: QualityScope, id: string): void {
  const entry = registry.get(key(scope, id));
  if (!entry) return;
  if (!entry.timer && !entry.abandoned) arm(entry);
}

/** Explicitly disarm (e.g. on RoomEvent.Reconnected). */
export function disarmHardReconnectCap(scope: QualityScope, id: string): void {
  const entry = registry.get(key(scope, id));
  if (!entry) return;
  disarm(entry);
}

/** Full cleanup on unmount or explicit user disconnect. */
export function unregisterHardReconnectCap(scope: QualityScope, id: string): void {
  const k = key(scope, id);
  const entry = registry.get(k);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  try {
    entry.room.off(RoomEvent.ConnectionStateChanged, entry.stateHandler);
  } catch {
    /* room may already be torn down */
  }
  registry.delete(k);
}

export function isHardReconnectAbandoned(
  scope: QualityScope,
  id: string | null | undefined,
): boolean {
  if (!id) return false;
  return registry.get(key(scope, id))?.abandoned ?? false;
}

export function __resetHardReconnectCapRegistryForTests() {
  for (const entry of registry.values()) {
    if (entry.timer) clearTimeout(entry.timer);
    try { entry.room.off(RoomEvent.ConnectionStateChanged, entry.stateHandler); } catch { /* */ }
  }
  registry.clear();
}
