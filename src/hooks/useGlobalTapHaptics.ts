/**
 * Pillar 2 — Global tap haptics.
 *
 * Delegates a single capture-phase pointerdown listener at window level
 * that fires a light haptic on any genuine button / role=button / link
 * tap. Native Android feel without touching every call-site.
 *
 * Rules:
 *  - Only on real touch input (pointerType === 'touch').
 *  - Skips disabled controls, form inputs, sliders, range, contenteditable.
 *  - Skips controls inside chat/reels/livestream surfaces that have their
 *    own dense gesture handling (opt-out via `data-no-haptic` on any
 *    ancestor).
 *  - Respects the user's haptics setting + reduced-motion (handled by
 *    `tapLight()` itself).
 *  - Throttled to 1 fire per 80ms to avoid double-pulse on drag/scroll.
 */
import { useEffect } from "react";
import { tapLight } from "@/utils/haptics";

export function useGlobalTapHaptics() {
  useEffect(() => {
    let lastFire = 0;

    const handler = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Walk up to find an actionable ancestor; bail if we hit an opt-out.
      const actionable = target.closest<HTMLElement>(
        'button, [role="button"], a[href], label[for], summary, .tap-target'
      );
      if (!actionable) return;

      if (actionable.closest("[data-no-haptic]")) return;

      // Skip disabled / aria-disabled.
      if (
        (actionable as HTMLButtonElement).disabled ||
        actionable.getAttribute("aria-disabled") === "true"
      ) {
        return;
      }

      // Skip when the tap originates on text input surfaces.
      const tag = target.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }

      const now = performance.now();
      if (now - lastFire < 80) return;
      lastFire = now;

      tapLight();
    };

    window.addEventListener("pointerdown", handler, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", handler, { capture: true } as any);
  }, []);
}
