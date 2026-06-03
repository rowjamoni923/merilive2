// =============================================================================
// LOW-END DEVICE DETECTION + ANIMATION THROTTLE
// =============================================================================
// Detects budget Android (≤2GB RAM, ≤4 cores, slow network, or explicit
// data-saver) and flags it so framer-motion and CSS animations can either
// skip or simplify their work. Result is computed ONCE on first call and
// cached for the rest of the session.
// =============================================================================

let _cached: boolean | null = null;

export function isLowEndDevice(): boolean {
  if (_cached !== null) return _cached;
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return (_cached = false);
  }

  // Respect the user's OS-level setting first.
  const reducedMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  // Memory: Chrome exposes deviceMemory (GB). Anything ≤ 2 GB is budget tier.
  const mem = (navigator as any).deviceMemory as number | undefined;
  const lowMem = typeof mem === "number" && mem > 0 && mem <= 2;

  // CPU cores. Budget phones ship 4-core Cortex-A53/A55 clusters.
  const cores = navigator.hardwareConcurrency ?? 8;
  const lowCpu = cores > 0 && cores <= 4;

  // Network: Save-Data header / 2g / slow-2g / 3g all indicate constrained
  // download budgets — usually correlates with budget hardware in the same
  // markets we ship to.
  const conn = (navigator as any).connection;
  const saveData = conn?.saveData === true;
  const slowNet = ["slow-2g", "2g", "3g"].includes(conn?.effectiveType);

  _cached = reducedMotion || lowMem || lowCpu || saveData || slowNet;
  return _cached;
}

/**
 * Applies a `reduce-motion` class to <html> when the device is low-end so
 * global CSS rules in index.css can throttle keyframes / transitions for
 * the entire app without per-component changes.
 */
export function applyLowEndMotionClass(): void {
  if (typeof document === "undefined") return;
  const low = isLowEndDevice();
  document.documentElement.classList.toggle("reduce-motion", low);
}
