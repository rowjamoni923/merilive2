/**
 * 🔄 Admin Global Realtime Subscriber
 * =====================================================
 * Single source of truth for admin-side postgres_changes.
 *
 * - Subscribes ONCE to all GLOBALLY_MONITORED_TABLES via chunked channels
 *   (Supabase has a per-channel binding limit, so we split into chunks of 8).
 * - Dispatches ADMIN_REALTIME_EVENT on the window for every change.
 * - Per-event dedupe: ignores duplicate INSERT/UPDATE deliveries arriving
 *   within DEDUPE_WINDOW_MS of each other.
 * - Exponential reconnect on channel errors / disconnects.
 * - Auto-reconnect on tab visibility resume after >30s away.
 *
 * Lifecycle: started by AdminLayout once admin session is verified, stopped
 * on admin logout. Multiple start() calls are idempotent.
 */
import {
  ADMIN_REALTIME_EVENT,
  GLOBALLY_MONITORED_TABLES,
  type AdminTableUpdateEvent,
} from "@/hooks/useAdminRealtime";

const DEDUPE_WINDOW_MS = 800;
const VISIBILITY_RESUME_THRESHOLD_MS = 30_000;

let started = false;
const recentEvents = new Map<string, number>();
let lastVisibilityHidden = 0;
let visibilityHandler: (() => void) | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let adminBroadcastHandler: ((event: Event) => void) | null = null;

function makeDedupeKey(table: string, eventType: string, payload: any): string {
  const id = payload?.id ?? payload?.uuid ?? "";
  // For UPDATE include updated_at if present so legitimate consecutive
  // updates aren't suppressed.
  const stamp = payload?.updated_at ?? payload?.created_at ?? "";
  return `${table}:${eventType}:${id}:${stamp}`;
}

function shouldDispatch(detail: AdminTableUpdateEvent): boolean {
  const key = makeDedupeKey(detail.table, detail.eventType, detail.payload);
  const now = Date.now();
  const last = recentEvents.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return false;
  recentEvents.set(key, now);
  return true;
}

function pruneDedupeMap() {
  const cutoff = Date.now() - DEDUPE_WINDOW_MS * 4;
  for (const [k, ts] of recentEvents) {
    if (ts < cutoff) recentEvents.delete(k);
  }
}

function buildChunk(state: ChunkState) {
  const channelName = `admin-rt-chunk-${state.index}-${Date.now()}`;
  let channel = adminSupabase.channel(channelName);

  for (const table of state.tables) {
    channel = channel.on(
      "postgres_changes" as any,
      { event: "*", schema: "public", table },
      (payload: any) => {
        const eventType = (payload.eventType || payload.type || "")
          .toString()
          .toUpperCase() as AdminTableUpdateEvent["eventType"];
        const row =
          eventType === "DELETE"
            ? payload.old ?? payload.oldRecord ?? null
            : payload.new ?? payload.newRecord ?? null;
        const detail: AdminTableUpdateEvent = {
          table,
          eventType,
          payload: row,
        };
        if (!shouldDispatch(detail)) return;
        dispatchAdminTableUpdate(detail);
      }
    );
  }

  channel.subscribe((status: string) => {
    if (status === "SUBSCRIBED") {
      state.retryAttempt = 0;
      console.log(
        `[AdminGlobalRT] ✅ chunk ${state.index} subscribed (${state.tables.length} tables)`
      );
    } else if (
      status === "CHANNEL_ERROR" ||
      status === "TIMED_OUT" ||
      status === "CLOSED"
    ) {
      console.warn(
        `[AdminGlobalRT] ⚠️ chunk ${state.index} status=${status}, scheduling reconnect`
      );
      scheduleReconnect(state);
    }
  });

  state.channel = channel;
}

function scheduleReconnect(state: ChunkState) {
  if (state.retryTimer) return;
  const delay = Math.min(
    RECONNECT_BASE_MS * Math.pow(2, state.retryAttempt),
    RECONNECT_MAX_MS
  );
  state.retryAttempt += 1;
  state.retryTimer = setTimeout(() => {
    state.retryTimer = null;
    teardownChunk(state);
    if (started) buildChunk(state);
  }, delay);
}

function teardownChunk(state: ChunkState) {
  if (state.channel) {
    try {
      adminSupabase.removeChannel(state.channel);
    } catch {
      /* noop */
    }
    state.channel = null;
  }
  if (state.retryTimer) {
    clearTimeout(state.retryTimer);
    state.retryTimer = null;
  }
}

function reconnectAll() {
  for (const c of chunks) {
    teardownChunk(c);
    c.retryAttempt = 0;
    if (started) buildChunk(c);
  }
}

function setupVisibilityHandler() {
  if (visibilityHandler || typeof document === "undefined") return;
  visibilityHandler = () => {
    if (document.visibilityState === "hidden") {
      lastVisibilityHidden = Date.now();
    } else if (document.visibilityState === "visible") {
      const away = Date.now() - lastVisibilityHidden;
      if (lastVisibilityHidden && away > VISIBILITY_RESUME_THRESHOLD_MS) {
        console.log(
          `[AdminGlobalRT] 🔄 Tab resumed after ${Math.round(away / 1000)}s — reconnecting channels`
        );
        reconnectAll();
      }
      lastVisibilityHidden = 0;
    }
  };
  document.addEventListener("visibilitychange", visibilityHandler);
}

function teardownVisibilityHandler() {
  if (!visibilityHandler || typeof document === "undefined") return;
  document.removeEventListener("visibilitychange", visibilityHandler);
  visibilityHandler = null;
}

export function startAdminGlobalRealtime() {
  if (started) return;
  started = true;
  const tables = Array.from(GLOBALLY_MONITORED_TABLES);

  for (let i = 0; i < tables.length; i += CHUNK_SIZE) {
    const state: ChunkState = {
      index: chunks.length,
      tables: tables.slice(i, i + CHUNK_SIZE),
      channel: null,
      retryAttempt: 0,
      retryTimer: null,
    };
    chunks.push(state);
    buildChunk(state);
  }

  setupVisibilityHandler();
  if (!cleanupInterval) {
    cleanupInterval = setInterval(pruneDedupeMap, 5_000);
  }

  console.log(
    `[AdminGlobalRT] 🚀 Started with ${chunks.length} chunks covering ${tables.length} tables`
  );
}

export function stopAdminGlobalRealtime() {
  if (!started) return;
  started = false;
  for (const c of chunks) teardownChunk(c);
  chunks.length = 0;
  recentEvents.clear();
  teardownVisibilityHandler();
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  console.log("[AdminGlobalRT] 🛑 Stopped");
}

export function forceAdminRealtimeReconnect() {
  console.log("[AdminGlobalRT] 🔄 Manual force reconnect");
  reconnectAll();
}

// Re-export for convenience
export { ADMIN_REALTIME_EVENT };
