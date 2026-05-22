/**
 * 🔄 Admin Global Realtime Subscriber
 * =====================================================
 * Admin global realtime lifecycle shim.
 *
 * Pkg93 audit: direct admin postgres_changes channels are forbidden because
 * the server publication contains only admin_broadcast/notifications/session.
 * Admin pages now consume the global `admin-table-update` event emitted by
 * useAdminBroadcastSync's single admin_broadcast subscription.
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

function reconnectAll() {
  window.dispatchEvent(new Event("visibilitychange"));
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

  setupVisibilityHandler();
  if (!cleanupInterval) {
    cleanupInterval = setInterval(pruneDedupeMap, 5_000);
  }

  console.log(
    `[AdminGlobalRT] 🚀 Started using admin_broadcast bridge covering ${tables.length} tables`
  );
}

export function stopAdminGlobalRealtime() {
  if (!started) return;
  started = false;
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
