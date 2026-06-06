/**
 * Pkg434 Pass 7 — Global route-transition orchestration
 *
 * Mount once inside <BrowserRouter>. On every pathname change it:
 *   1. Briefly tags <body> with `.route-changing` (240ms) so CSS in
 *      index.css can animate any opt-in page wrapper marked `[data-page]`.
 *   2. Scrolls the document to top so each new page starts at the top
 *      (matches native app navigation feel) — unless the new path uses
 *      a hash anchor.
 *   3. Skips work when the route stays on the same path (only search/
 *      hash changed) so in-page filter changes don't flash.
 *
 * Respects `prefers-reduced-motion` via the global CSS guard in Pass 4.
 * Zero per-page changes required.
 */
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

export function RouteTransitionHost() {
  const location = useLocation();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    const path = location.pathname;
    const prev = prevPathRef.current;
    prevPathRef.current = path;

    // Skip on initial mount and on same-path navigations.
    if (prev === null || prev === path) return;

    try {
      const body = document.body;
      body.classList.add("route-changing");

      // Native-feel: jump to top on real page change (skip if hash anchor).
      if (!location.hash) {
        // Use rAF so the new page has painted at scroll(0) before transition.
        requestAnimationFrame(() => {
          try {
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
          } catch {
            /* noop */
          }
        });
      }

      const t = window.setTimeout(() => {
        body.classList.remove("route-changing");
      }, 260);

      return () => {
        window.clearTimeout(t);
        body.classList.remove("route-changing");
      };
    } catch {
      /* swallow — transitions must never break navigation */
    }
  }, [location.pathname, location.hash]);

  return null;
}
