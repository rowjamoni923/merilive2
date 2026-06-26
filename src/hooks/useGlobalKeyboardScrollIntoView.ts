/**
 * useGlobalKeyboardScrollIntoView
 * ---------------------------------
 * Native-Android-grade focus handling for ANY input / textarea / contenteditable
 * in the app — without each form having to wire its own listener.
 *
 * Why this exists
 * ---------------
 * Capacitor is configured with `Keyboard.resize: 'none'` (required to keep the
 * camera / LiveKit surface stable when typing in chat). With `resize: 'none'`,
 * the WebView viewport does NOT shrink when the keyboard appears, so the
 * browser's default "scroll focused element into view" calculation thinks the
 * input is already visible — even when the keyboard is covering it.
 *
 * This hook bridges that gap: when a focusable input gains focus AND
 * `--kb-h > 0` (set by useKeyboardInsets), we measure the element rect and
 * smoothly scroll its nearest scrollable ancestor (or window) so the input
 * sits comfortably above the keyboard with a small breathing margin.
 *
 * Safety
 * ------
 * - Skips elements inside chat composers / dialogs that already self-lift
 *   (they carry `data-kb-managed="true"` or sit inside a `[role="dialog"]`
 *   whose own kb-aware logic positions them).
 * - Skips elements with `data-kb-skip="true"`.
 * - Throttled via rAF; idempotent; no layout thrash.
 * - Zero effect when keyboard is closed.
 */
import { useEffect } from "react";

const FOCUSABLE_SELECTOR =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"]),textarea,[contenteditable="true"],[contenteditable=""]';

function getKbHeight(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--kb-h");
  const px = parseInt(raw, 10);
  return Number.isFinite(px) ? px : 0;
}

function shouldSkip(el: HTMLElement): boolean {
  if (el.dataset.kbSkip === "true") return true;
  // Inside Radix Dialog → DialogContent already shifts via --kb-h. Skip to
  // avoid double-scroll.
  if (el.closest('[role="dialog"]')) return true;
  // Inside a self-managed chat composer (chat/reels/livestream/call/party/AI/support)
  if (el.closest('[data-kb-managed="true"]')) return true;
  // Inside the existing `.chat-composer-stable` block — those already lift.
  if (el.closest(".chat-composer-stable")) return true;
  return false;
}

function scrollFocusedIntoView(el: HTMLElement) {
  const kb = getKbHeight();
  if (kb <= 0) return;

  // 24px breathing room above keyboard.
  const margin = 24;
  const visibleBottom = window.innerHeight - kb - margin;
  const rect = el.getBoundingClientRect();

  if (rect.bottom <= visibleBottom && rect.top >= margin) {
    // Already comfortably in view.
    return;
  }

  const delta = rect.bottom - visibleBottom;
  if (Math.abs(delta) < 4) return;

  // Walk up to the nearest scrollable ancestor.
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    const canScroll =
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight;
    if (canScroll) {
      node.scrollTo({ top: node.scrollTop + delta, behavior: "smooth" });
      return;
    }
    node = node.parentElement;
  }

  // Fall back to window scroll.
  window.scrollTo({ top: window.scrollY + delta, behavior: "smooth" });
}

export function useGlobalKeyboardScrollIntoView() {
  useEffect(() => {
    let raf = 0;
    let pending: HTMLElement | null = null;

    const schedule = (el: HTMLElement) => {
      pending = el;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!pending) return;
        scrollFocusedIntoView(pending);
        pending = null;
      });
    };

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !(target instanceof HTMLElement)) return;
      if (!target.matches(FOCUSABLE_SELECTOR)) return;
      if (shouldSkip(target)) return;

      // Wait one frame so any keyboard-open transition can begin and --kb-h
      // can update before we measure.
      schedule(target);
      // Also re-run after a short delay because the Android keyboard takes
      // ~150ms to fully appear on some devices.
      window.setTimeout(() => {
        if (document.activeElement === target) scrollFocusedIntoView(target);
      }, 220);
    };

    // Also react when --kb-h changes while an input is already focused.
    const mo = new MutationObserver(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active && active.matches?.(FOCUSABLE_SELECTOR) && !shouldSkip(active)) {
        scrollFocusedIntoView(active);
      }
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "data-kb-open"] });

    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn, true);
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);
}
