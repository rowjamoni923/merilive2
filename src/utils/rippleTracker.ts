/**
 * Pkg434 — Pass 4: Global ripple position tracker.
 *
 * Sets CSS vars --rx / --ry on any .ripple element at the touched point
 * so the ::after radial-gradient bursts from the finger, not the center.
 *
 * Single pointerdown listener on document. Cheap, passive, no React.
 */
export function installRippleTracker() {
  if (typeof window === "undefined") return;
  if ((window as any).__pkg434RippleInstalled) return;
  (window as any).__pkg434RippleInstalled = true;

  const handler = (ev: PointerEvent) => {
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    const el = target.closest<HTMLElement>(".ripple");
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = ((ev.clientX - rect.left) / rect.width) * 100;
    const y = ((ev.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--rx", `${x}%`);
    el.style.setProperty("--ry", `${y}%`);
  };

  document.addEventListener("pointerdown", handler, { passive: true });
}
