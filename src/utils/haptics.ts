/**
 * Pkg434 — Pass 5: Centralized haptics helper.
 *
 * Wraps @capacitor/haptics with safe web fallback (navigator.vibrate)
 * and a single shared "enabled" flag (localStorage key: pkg434:haptics).
 *
 * Calls are fire-and-forget — never throw, never await on caller side.
 *
 * Usage:
 *   import { tapLight, tapMedium, tapSuccess, tapError, tapSelection } from "@/utils/haptics";
 *   <button onClick={() => { tapLight(); doThing(); }} />
 *
 * Respects:
 *   - localStorage "pkg434:haptics" === "off"  → disabled
 *   - prefers-reduced-motion: reduce            → disabled
 *   - non-touch devices (hover:hover + pointer:fine) → disabled
 */

const STORAGE_KEY = "pkg434:haptics";

let cachedEnabled: boolean | null = null;
let HapticsModule: any = null;
let ImpactStyle: any = null;
let NotificationType: any = null;
let loadingPromise: Promise<void> | null = null;

function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  } catch {
    return "ontouchstart" in window;
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function isHapticsEnabled(): boolean {
  if (cachedEnabled !== null) return cachedEnabled;
  if (typeof window === "undefined") return false;
  if (prefersReducedMotion()) return (cachedEnabled = false);
  if (!isTouchDevice()) return (cachedEnabled = false);
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    cachedEnabled = v !== "off";
  } catch {
    cachedEnabled = true;
  }
  return cachedEnabled;
}

export function setHapticsEnabled(on: boolean) {
  cachedEnabled = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
}

async function loadHaptics() {
  if (HapticsModule) return;
  if (!loadingPromise) {
    loadingPromise = import("@capacitor/haptics")
      .then((mod) => {
        HapticsModule = mod.Haptics;
        ImpactStyle = mod.ImpactStyle;
        NotificationType = mod.NotificationType;
      })
      .catch(() => {
        HapticsModule = null;
      });
  }
  await loadingPromise;
}

function webVibrate(ms: number | number[]) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      (navigator as any).vibrate(ms);
    }
  } catch {
    /* ignore */
  }
}

async function impact(style: "Light" | "Medium" | "Heavy", fallbackMs: number) {
  if (!isHapticsEnabled()) return;
  await loadHaptics();
  if (HapticsModule && ImpactStyle) {
    try {
      await HapticsModule.impact({ style: ImpactStyle[style] });
      return;
    } catch {
      /* fall through */
    }
  }
  webVibrate(fallbackMs);
}

async function notify(type: "Success" | "Warning" | "Error", fallback: number | number[]) {
  if (!isHapticsEnabled()) return;
  await loadHaptics();
  if (HapticsModule && NotificationType) {
    try {
      await HapticsModule.notification({ type: NotificationType[type] });
      return;
    } catch {
      /* fall through */
    }
  }
  webVibrate(fallback);
}

/** Quick UI tap (button press, toggle) — ~10ms. */
export function tapLight() {
  void impact("Light", 8);
}
/** Significant tap (open sheet, confirm) — ~20ms. */
export function tapMedium() {
  void impact("Medium", 16);
}
/** Heavy tap (long-press trigger, large action) — ~30ms. */
export function tapHeavy() {
  void impact("Heavy", 28);
}
/** Selection change (pickers, segmented controls) — very light. */
export function tapSelection() {
  if (!isHapticsEnabled()) return;
  void loadHaptics().then(() => {
    if (HapticsModule?.selectionChanged) {
      try {
        void HapticsModule.selectionChanged();
        return;
      } catch {
        /* fall through */
      }
    }
    webVibrate(5);
  });
}
/** Success outcome (gift sent, login OK). */
export function tapSuccess() {
  void notify("Success", [12, 40, 12]);
}
/** Warning outcome (insufficient balance, etc.). */
export function tapWarning() {
  void notify("Warning", [20, 60, 20]);
}
/** Error outcome (failed action, validation error). */
export function tapError() {
  void notify("Error", [30, 80, 30, 80, 30]);
}
