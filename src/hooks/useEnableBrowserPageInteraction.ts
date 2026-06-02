import { useEffect } from "react";

const ZOOMABLE_VIEWPORT_CONTENT = "width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=10, user-scalable=yes";

type BrowserPageInteractionOptions = {
  mode?: "document" | "app-shell";
};

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

    const previousViewport = viewport?.getAttribute("content") ?? null;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlTouchAction = html.style.touchAction;
    const previousBodyTouchAction = body.style.touchAction;
    const previousHtmlOverscroll = html.style.overscrollBehavior;
    const previousHtmlOverscrollY = html.style.overscrollBehaviorY;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousBodyOverscrollY = body.style.overscrollBehaviorY;
    const previousRootOverflow = root?.style.overflow ?? "";
    const previousRootHeight = root?.style.height ?? "";
    const previousRootMinHeight = root?.style.minHeight ?? "";
    const previousRootTouchAction = root?.style.touchAction ?? "";
    const previousRootOverscroll = root?.style.overscrollBehavior ?? "";
    const previousRootOverscrollY = root?.style.overscrollBehaviorY ?? "";

    if (viewport) {
      viewport.setAttribute("content", ZOOMABLE_VIEWPORT_CONTENT);
    }

    // Do not hard-lock html/body/root for admin. The admin CSS layer decides
    // desktop pane scrolling vs mobile natural document scrolling via media
    // queries; an inline overflow:hidden here blocks mobile pages entirely.
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
      if (viewport) {
        if (previousViewport) {
          viewport.setAttribute("content", previousViewport);
        } else {
          viewport.removeAttribute("content");
        }
      }

      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      html.style.touchAction = previousHtmlTouchAction;
      body.style.touchAction = previousBodyTouchAction;
      html.style.overscrollBehavior = previousHtmlOverscroll;
      html.style.overscrollBehaviorY = previousHtmlOverscrollY;
      body.style.overscrollBehavior = previousBodyOverscroll;
      body.style.overscrollBehaviorY = previousBodyOverscrollY;

      if (root) {
        root.style.overflow = previousRootOverflow;
        root.style.height = previousRootHeight;
        root.style.minHeight = previousRootMinHeight;
        root.style.touchAction = previousRootTouchAction;
        root.style.overscrollBehavior = previousRootOverscroll;
        root.style.overscrollBehaviorY = previousRootOverscrollY;
      }
    };
  }, [options.mode]);
}

export default useEnableBrowserPageInteraction;
