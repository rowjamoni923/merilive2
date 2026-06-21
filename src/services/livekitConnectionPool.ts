/**
 * LiveKit Connection Pool — Phase 5 of instant-entry architecture.
 *
 * Maintains POOL_SIZE (=2) "warm" Room instances that have completed
 * `Room.prepareConnection(url, token)` against the LiveKit SFU. These Rooms
 * are NEVER consumed by real entry sites (host/viewer/party/call all need
 * site-specific RoomOptions — videoCaptureDefaults, simulcastLayers, e2ee,
 * codec picks, etc. that the pool can't pre-bake).
 *
 * What the pool actually buys us
 * ------------------------------
 * `prepareConnection` resolves DNS + completes TLS handshake + (on Cloud)
 * picks the edge region. The benefits of that work live in the OS / browser
 * networking stack (DNS cache ~60s, TLS session-resumption tickets ~10min),
 * NOT inside the Room instance. So by keeping 2 Rooms continuously in the
 * "prepared" state and refreshing them every REFRESH_MS, we keep those
 * OS-level caches hot. When a real entry site does `new Room().connect()`,
 * its TCP/TLS handshake is a session-resumption (~1 RTT instead of 3),
 * shaving 150-300ms off the cold path even when Phase 2 viewport warmup
 * didn't fire (e.g. deep-link entry, push-tap, search result).
 *
 * Why not `acquire()` and hand the Room to the caller?
 * ----------------------------------------------------
 * Tried in the research doc, but the four entry sites
 * (useLiveKitClient, useLiveKitCall, usePartyRoomNativeLiveKit,
 * usePKOpponentRoom) each build Room with very different options. Mutating
 * options post-construction is unsupported in livekit-client. Forcing a
 * shared RoomOptions across all of them would regress audio/video tuning.
 * So the pool is "warmth only" — a heartbeat that keeps the wire hot. Room
 * construction itself is <5ms; the win is the warm TLS session.
 *
 * Public API
 * ----------
 *  - initConnectionPool()  one-shot at app boot
 *  - pulseConnectionPool() optional: callers invoke right before their own
 *                          `new Room().connect()` to force-refresh one slot
 *                          NOW (covers the case where last refresh was >4min
 *                          ago and TLS tickets just expired)
 *  - shutdownConnectionPool() teardown (route to /admin, background, etc.)
 */
import { Room } from "livekit-client";
import { livekitTokenCache } from "@/services/livekitTokenCache";

const POOL_SIZE = 2;
// Refresh well inside the 10-minute TLS session-ticket window so resumption
// stays available on every fresh `connect()`.
const REFRESH_MS = 4 * 60_000;

interface PoolSlot {
  room: Room | null;
  preparedAtMs: number;
}

const slots: PoolSlot[] = [];
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let initialized = false;

const teardownSlot = (slot: PoolSlot) => {
  if (!slot.room) return;
  try {
    void slot.room.disconnect(true);
  } catch {
    /* noop */
  }
  slot.room = null;
};

const prepareSlot = async (slot: PoolSlot): Promise<void> => {
  const tokenEntry = livekitTokenCache.getCached();
  if (!tokenEntry) {
    // No wildcard viewer token yet — kick off mint, retry on next tick.
    void livekitTokenCache.refresh();
    return;
  }

  teardownSlot(slot);

  let room: Room;
  try {
    room = new Room({
      adaptiveStream: true,
      dynacast: false,
      reconnectPolicy: { nextRetryDelayInMs: () => null },
    });
  } catch {
    return;
  }

  slot.room = room;
  try {
    await room.prepareConnection(tokenEntry.url, tokenEntry.token);
    slot.preparedAtMs = Date.now();
  } catch {
    teardownSlot(slot);
  }

  // Phase 6 (Android native parity): the web `prepareConnection` above warms
  // the WebView's networking stack. Native publisher paths (host Go Live,
  // private call, party-room mic) run through the Kotlin LiveKit SDK which
  // has its OWN OkHttp/WebRTC socket pool — so we also pulse the native
  // plugin to keep that stack hot. No-op on web/iOS via Proxy.
  try {
    const { NativeLiveKit } = await import("@/plugins/NativeLiveKit");
    const { Capacitor } = await import("@capacitor/core");
    if (Capacitor.getPlatform() === "android" && typeof NativeLiveKit.prepareConnection === "function") {
      void NativeLiveKit.prepareConnection({
        url: tokenEntry.url,
        token: tokenEntry.token,
      }).catch(() => { /* non-fatal */ });
    }
  } catch {
    /* non-fatal */
  }
};

const refreshAllSlots = (): void => {
  for (const slot of slots) {
    void prepareSlot(slot);
  }
};

/** One-shot boot. Idempotent. Safe to call before auth resolves. */
export const initConnectionPool = (): void => {
  if (initialized) return;
  initialized = true;

  for (let i = 0; i < POOL_SIZE; i++) {
    slots.push({ room: null, preparedAtMs: 0 });
  }

  // Initial fill — staggered slightly so we don't race two identical
  // prepareConnection calls into the same TLS handshake.
  void prepareSlot(slots[0]);
  setTimeout(() => {
    if (slots[1]) void prepareSlot(slots[1]);
  }, 250);

  refreshTimer = setInterval(refreshAllSlots, REFRESH_MS);

  // Re-warm when tab returns to foreground (TLS tickets may have expired
  // while the device slept).
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        const stale = Date.now() - REFRESH_MS;
        for (const slot of slots) {
          if (slot.preparedAtMs < stale) void prepareSlot(slot);
        }
      }
    });
  }
};

/**
 * Force-refresh one slot NOW. Call this right before opening a real Room
 * connection on a cold-deep-link / push-tap path so the about-to-fire
 * `connect()` gets the freshest TLS session ticket. Non-blocking.
 */
export const pulseConnectionPool = (): void => {
  if (!initialized) return;
  // Refresh the slot that's been prepared the longest.
  let oldest = slots[0];
  for (const slot of slots) {
    if (slot.preparedAtMs < (oldest?.preparedAtMs ?? Infinity)) oldest = slot;
  }
  if (oldest) void prepareSlot(oldest);
};

/** Teardown — call on route to /admin, app background, or sign-out. */
export const shutdownConnectionPool = (): void => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
  for (const slot of slots) teardownSlot(slot);
  slots.length = 0;
  initialized = false;
};

/** Debug helper — number of slots currently in the prepared state. */
export const getConnectionPoolStats = () => ({
  initialized,
  size: slots.length,
  preparedCount: slots.filter((s) => s.room !== null).length,
  ages: slots.map((s) => (s.preparedAtMs ? Date.now() - s.preparedAtMs : -1)),
});
