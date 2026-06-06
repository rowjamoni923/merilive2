/**
 * Pkg435 — Phase 15 — Native-feel scroll restoration.
 *
 * Before:  every route change → window.scrollTo(0,0).
 * After:
 *   - Forward navigation (PUSH/REPLACE) → scroll to top (same as before).
 *   - Back navigation     (POP)         → restore the exact Y the user
 *                                         was at when they left that route,
 *                                         just like native Android apps and
 *                                         the browser's bfcache do.
 *
 * Persistence: sessionStorage `merilive-scroll:<pathname+search>` → number.
 * Caps at 200 entries (FIFO trim) to keep storage tiny.
 * Save on every pathname change *before* the new effect runs (captures the
 * outgoing scroll). Save again on visibilitychange=hidden / pagehide so
 * Android process-death restore works.
 *
 * Mounted once inside <BrowserRouter>.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const STORE_PREFIX = "merilive-scroll:";
const STORE_INDEX_KEY = "merilive-scroll:__keys";
const MAX_ENTRIES = 200;

function safeGet(): string[] {
  try {
    const raw = sessionStorage.getItem(STORE_INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function safeSetIndex(keys: string[]) {
  try {
    sessionStorage.setItem(STORE_INDEX_KEY, JSON.stringify(keys));
  } catch {
    /* quota */
  }
}

function saveScroll(key: string, y: number) {
  try {
    sessionStorage.setItem(STORE_PREFIX + key, String(y));
    const keys = safeGet().filter((k) => k !== key);
    keys.push(key);
    while (keys.length > MAX_ENTRIES) {
      const drop = keys.shift();
      if (drop) sessionStorage.removeItem(STORE_PREFIX + drop);
    }
    safeSetIndex(keys);
  } catch {
    /* quota */
  }
}

function readScroll(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(STORE_PREFIX + key);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

const ScrollToTop = () => {
  const { pathname, search } = useLocation();
  const navType = useNavigationType(); // "POP" | "PUSH" | "REPLACE"
  const previousKeyRef = useRef<string | null>(null);

  // Persist outgoing scroll on app background / process death so the user
  // returns to the same offset after Android reclaims memory.
  useEffect(() => {
    const persist = () => {
      const key = pathname + search;
      saveScroll(key, window.scrollY || 0);
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") persist();
    });
    window.addEventListener("pagehide", persist);
    return () => {
      window.removeEventListener("pagehide", persist);
    };
  }, [pathname, search]);

  // Run BEFORE paint so the new page never flashes at the wrong offset.
  useLayoutEffect(() => {
    const newKey = pathname + search;
    const prevKey = previousKeyRef.current;

    // Capture the outgoing route's scroll position before we leave.
    if (prevKey && prevKey !== newKey) {
      saveScroll(prevKey, window.scrollY || 0);
    }

    if (navType === "POP") {
      // Back navigation — restore.
      const y = readScroll(newKey);
      if (y != null && y > 0) {
        // Two-pass restore: immediately, then after layout settles, in case
        // the new page lazy-mounts above the saved offset.
        window.scrollTo({ top: y, left: 0, behavior: "auto" });
        requestAnimationFrame(() => {
          window.scrollTo({ top: y, left: 0, behavior: "auto" });
        });
      } else {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
    } else {
      // PUSH or REPLACE — start at the top, native-app convention.
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }

    previousKeyRef.current = newKey;
  }, [pathname, search, navType]);

  return null;
};

export default ScrollToTop;
