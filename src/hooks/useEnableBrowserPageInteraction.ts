import { useEffect } from "react";

const ZOOMABLE_VIEWPORT_CONTENT = "width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=10, user-scalable=yes";

type BrowserPageInteractionOptions = {
  mode?: "document" | "app-shell";
};

// Module-level ref count + saved originals. Multiple public pages can mount
// in sequence (navigation A -> B). React runs new effect BEFORE old cleanup,
// so a naive save/restore would let B's cleanup put A's "hidden" back and
// lock scrolling. Count active users and only restore when the last unmounts.
let activeCount = 0;
let saved: null | {
  viewport: string | null;
  htmlOverflow: string;
  bodyOverflow: string;
  htmlTouchAction: string;
  bodyTouchAction: string;
  htmlOverscroll: string;
  htmlOverscrollY: string;
  bodyOverscroll: string;
  bodyOverscrollY: string;
  rootOverflow: string;
  rootHeight: string;
  rootMinHeight: string;
  rootTouchAction: string;
  rootOverscroll: string;
  rootOverscrollY: string;
} = null;

/**
 * Public browser pages like /link and admin must keep native browser scroll
 * and pinch-zoom enabled, even if app screens use stricter interaction rules.
 */
export function useEnableBrowserPageInteraction(options: BrowserPageInteractionOptions = {}) {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const mode = options.mode ?? "document";

    const viewport = document.querySelector('meta[name="viewport"]');
    const root = document.getElementById("root");
    const html = document.documentElement;
    const body = document.body;

    if (activeCount === 0) {
      saved = {
        viewport: viewport?.getAttribute("content") ?? null,
        htmlOverflow: html.style.overflow,
        bodyOverflow: body.style.overflow,
        htmlTouchAction: html.style.touchAction,
        bodyTouchAction: body.style.touchAction,
        htmlOverscroll: html.style.overscrollBehavior,
        htmlOverscrollY: html.style.overscrollBehaviorY,
        bodyOverscroll: body.style.overscrollBehavior,
        bodyOverscrollY: body.style.overscrollBehaviorY,
        rootOverflow: root?.style.overflow ?? "",
        rootHeight: root?.style.height ?? "",
        rootMinHeight: root?.style.minHeight ?? "",
        rootTouchAction: root?.style.touchAction ?? "",
        rootOverscroll: root?.style.overscrollBehavior ?? "",
        rootOverscrollY: root?.style.overscrollBehaviorY ?? "",
      };
    }
    activeCount += 1;

    if (viewport) {
      viewport.setAttribute("content", ZOOMABLE_VIEWPORT_CONTENT);
    }

    html.style.overflow = "auto";
    body.style.overflow = "auto";
    html.style.touchAction = mode === "app-shell" ? "pan-y pinch-zoom" : "auto";
    body.style.touchAction = mode === "app-shell" ? "pan-y pinch-zoom" : "auto";
    html.style.overscrollBehavior = "auto";
    html.style.overscrollBehaviorY = "auto";
    body.style.overscrollBehavior = "auto";
    body.style.overscrollBehaviorY = "auto";

    if (root) {
      root.style.overflow = "visible";
      root.style.height = "auto";
      root.style.minHeight = mode === "app-shell" ? "100dvh" : "auto";
      root.style.touchAction = mode === "app-shell" ? "pan-y pinch-zoom" : "auto";
      root.style.overscrollBehavior = "auto";
      root.style.overscrollBehaviorY = "auto";
    }

    return () => {
      activeCount = Math.max(0, activeCount - 1);
      if (activeCount > 0 || !saved) return;

      if (viewport) {
        if (saved.viewport) viewport.setAttribute("content", saved.viewport);
        else viewport.removeAttribute("content");
      }
      html.style.overflow = saved.htmlOverflow;
      body.style.overflow = saved.bodyOverflow;
      html.style.touchAction = saved.htmlTouchAction;
      body.style.touchAction = saved.bodyTouchAction;
      html.style.overscrollBehavior = saved.htmlOverscroll;
      html.style.overscrollBehaviorY = saved.htmlOverscrollY;
      body.style.overscrollBehavior = saved.bodyOverscroll;
      body.style.overscrollBehaviorY = saved.bodyOverscrollY;
      if (root) {
        root.style.overflow = saved.rootOverflow;
        root.style.height = saved.rootHeight;
        root.style.minHeight = saved.rootMinHeight;
        root.style.touchAction = saved.rootTouchAction;
        root.style.overscrollBehavior = saved.rootOverscroll;
        root.style.overscrollBehaviorY = saved.rootOverscrollY;
      }
      saved = null;
    };
  }, [options.mode]);
}

export default useEnableBrowserPageInteraction;
