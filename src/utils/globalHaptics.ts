/**
 * Pkg434 Pass 6 — Global haptics auto-wiring
 *
 * One passive pointerdown listener on `document` fires a light tap whenever
 * the user touches a tappable element (button, link, role=button, [data-haptic]).
 * Opt-in stronger feedback via `data-haptic="medium|heavy|success|warning|error|selection"`.
 *
 * Zero per-component changes needed — every existing button across the app
 * gets native-feel feedback for free. Safe: gated by `pkg434:haptics` opt-out,
 * `prefers-reduced-motion`, non-touch devices, and inputs/textarea/contenteditable.
 */
import {
  tapLight,
  tapMedium,
  tapHeavy,
  tapSelection,
  tapSuccess,
  tapWarning,
  tapError,
} from "./haptics";

let installed = false;

const KIND_MAP: Record<string, () => void> = {
  light: tapLight,
  medium: tapMedium,
  heavy: tapHeavy,
  selection: tapSelection,
  success: tapSuccess,
  warning: tapWarning,
  error: tapError,
};

function isTappable(el: Element | null): { match: Element; kind: string } | null {
  let cur: Element | null = el;
  // Walk up at most 5 levels to find the actual interactive ancestor.
  for (let i = 0; i < 5 && cur; i++) {
    if (cur.nodeType !== 1) {
      cur = (cur as any).parentElement;
      continue;
    }
    const tag = cur.tagName;
    // Skip text inputs — they have their own keyboard feel.
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return null;
    if ((cur as HTMLElement).isContentEditable) return null;

    const dataKind = cur.getAttribute("data-haptic");
    if (dataKind !== null) {
      return { match: cur, kind: dataKind || "light" };
    }
    if (tag === "BUTTON" || tag === "A") return { match: cur, kind: "light" };
    const role = cur.getAttribute("role");
    if (role === "button" || role === "tab" || role === "menuitem" || role === "switch") {
      return { match: cur, kind: "light" };
    }
    cur = (cur as HTMLElement).parentElement;
  }
  return null;
}

export function installGlobalHaptics() {
  if (installed) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  installed = true;

  let lastTs = 0;
  document.addEventListener(
    "pointerdown",
    (e: PointerEvent) => {
      try {
        // Debounce: avoid double-fire when both pointerdown and synthetic click bubble.
        const now = e.timeStamp || Date.now();
        if (now - lastTs < 40) return;

        // Only primary button presses.
        if (e.button !== 0 && e.pointerType !== "touch") return;

        const hit = isTappable(e.target as Element);
        if (!hit) return;

        // Respect disabled buttons.
        const disabled = (hit.match as HTMLButtonElement).disabled;
        if (disabled) return;
        if (hit.match.getAttribute("aria-disabled") === "true") return;

        lastTs = now;
        const fn = KIND_MAP[hit.kind] || tapLight;
        fn();
      } catch {
        /* swallow — haptics must never break UI */
      }
    },
    { passive: true, capture: true },
  );
}
