import { registerPlugin, Capacitor } from "@capacitor/core";

export interface InAppReviewPlugin {
  request(): Promise<{ shown: boolean; reason?: string }>;
}

const native = registerPlugin<InAppReviewPlugin>("InAppReview");

const isAndroid = () =>
  typeof Capacitor !== "undefined" &&
  Capacitor.isNativePlatform?.() &&
  Capacitor.getPlatform?.() === "android";

const LAST_KEY = "inAppReview:lastRequestAt";
const COUNT_KEY = "inAppReview:requestCount";
// Play quota is ~ a few per year — we self-throttle conservatively.
const MIN_GAP_MS = 45 * 24 * 60 * 60 * 1000; // 45 days
const MAX_PER_YEAR = 3;

interface Counter { year: number; n: number }

function readCounter(): Counter {
  try {
    const raw = localStorage.getItem(COUNT_KEY);
    if (!raw) return { year: new Date().getFullYear(), n: 0 };
    const c = JSON.parse(raw);
    if (c.year !== new Date().getFullYear()) return { year: new Date().getFullYear(), n: 0 };
    return c;
  } catch { return { year: new Date().getFullYear(), n: 0 }; }
}

function bumpCounter() {
  const c = readCounter();
  c.n += 1;
  try { localStorage.setItem(COUNT_KEY, JSON.stringify(c)); } catch {}
}

/**
 * Pkg233 / M27 — In-App Review smart trigger.
 * Self-throttles: ≥45-day gap between asks and ≤3 asks per calendar year.
 * Safe on web / iOS (no-op).
 */
export const InAppReview = {
  isSupported: isAndroid,

  /** Returns true if we are allowed to ask right now (cooldown + cap). */
  canRequest(): boolean {
    if (!isAndroid()) return false;
    const last = Number(localStorage.getItem(LAST_KEY) || 0);
    if (Date.now() - last < MIN_GAP_MS) return false;
    if (readCounter().n >= MAX_PER_YEAR) return false;
    return true;
  },

  /**
   * Ask Play to show the review prompt. `eventName` is a tag for analytics.
   * Returns true if the flow ran (the Play Store decides if it actually shows).
   */
  async maybeRequest(eventName: string): Promise<boolean> {
    if (!this.canRequest()) return false;
    try {
      try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch {}
      bumpCounter();
      const res = await native.request();
      // Best-effort analytics breadcrumb (Pkg213).
      try {
        const { Analytics } = await import("./Analytics");
        Analytics.logEvent("in_app_review_requested", { event: eventName, shown: !!res.shown });
      } catch {}
      return !!res.shown;
    } catch {
      return false;
    }
  },

  /** Manual force from Settings → "Rate the app" — bypasses cooldown. */
  async forceRequest(): Promise<boolean> {
    if (!isAndroid()) return false;
    try {
      const res = await native.request();
      try { localStorage.setItem(LAST_KEY, String(Date.now())); } catch {}
      return !!res.shown;
    } catch { return false; }
  },
};
