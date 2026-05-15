/**
 * Admin Error Log
 * 
 * Centralized capture for failed admin REST queries, RPC calls, and edge function
 * invocations. Every failure is:
 *   1. Pushed into an in-memory ring buffer (last 100) accessible via getAdminErrorLog()
 *      or window.__adminErrorLog for quick inspection from DevTools.
 *   2. Logged to console.error with full context.
 *   3. Surfaced as a sonner toast so the admin sees the failure immediately
 *      (rate-limited per signature so a noisy endpoint doesn't spam).
 */
import { toast } from "sonner";

export interface AdminErrorEntry {
  ts: number;
  kind: 'rest' | 'rpc' | 'edge' | 'realtime' | 'other';
  label: string;          // short human label, e.g. "GET /rest/v1/profiles"
  status?: number;
  message: string;        // server message / parsed error
  detail?: string;        // raw body / stack snippet
  url?: string;
  silent?: boolean;       // internal/security failures: log in memory only, no toast/console noise
}

const RING: AdminErrorEntry[] = [];
const RING_MAX = 100;
const TOAST_COOLDOWN_MS = 8000;
const lastToast = new Map<string, number>();

export function getAdminErrorLog(): AdminErrorEntry[] {
  return RING.slice().reverse();
}

export function clearAdminErrorLog() {
  RING.length = 0;
}

export const ADMIN_ERROR_LOG_EVENT = 'admin-error-log-update';

export function recordAdminError(entry: Omit<AdminErrorEntry, 'ts'>) {
  const full: AdminErrorEntry = { ...entry, ts: Date.now() };
  RING.push(full);
  if (RING.length > RING_MAX) RING.shift();

  // Push event so UI updates instantly without polling.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ADMIN_ERROR_LOG_EVENT));
  }

  if (full.silent) return;

  // Console
  // eslint-disable-next-line no-console
  console.error(
    `[admin-error] ${full.kind.toUpperCase()} ${full.label}` +
      (full.status ? ` (${full.status})` : ''),
    { message: full.message, detail: full.detail, url: full.url }
  );

  // Toast (rate-limited per signature)
  const sig = `${full.kind}:${full.label}:${full.status ?? ''}`;
  const now = Date.now();
  const last = lastToast.get(sig) || 0;
  if (now - last > TOAST_COOLDOWN_MS) {
    lastToast.set(sig, now);
    toast.error(
      `Admin ${full.kind} failed${full.status ? ` (${full.status})` : ''}`,
      {
        description: `${full.label}\n${full.message}`.slice(0, 220),
        duration: 6000,
      }
    );
  }
}

// Expose for DevTools inspection
if (typeof window !== 'undefined') {
  (window as unknown as { __adminErrorLog: () => AdminErrorEntry[] }).__adminErrorLog =
    getAdminErrorLog;
}
