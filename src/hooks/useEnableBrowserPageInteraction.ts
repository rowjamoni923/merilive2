import { useEffect } from "react";

const ZOOMABLE_VIEWPORT_CONTENT = "width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=10, user-scalable=yes";

/**
 * Public browser pages like /link and admin must keep native browser scroll
 * and pinch-zoom enabled, even if app screens use stricter interaction rules.
 */
export function useEnableBrowserPageInteraction() {
  useEffect(() => {
    if (typeof document === "undefined") return;

    const viewport = document.querySelector('meta[name="viewport"]');
    const root = document.getElementById("root");
    const html = document.documentElement;
    const body = document.body;

    const previousViewport = viewport?.getAttribute("content") ?? null;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlTouchAction = html.style.touchAction;
    const previousBodyTouchAction = body.style.touchAction;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    const previousRootOverflow = root?.style.overflow ?? "";
    const previousRootHeight = root?.style.height ?? "";

    if (viewport) {
      viewport.setAttribute("content", ZOOMABLE_VIEWPORT_CONTENT);
    }

    html.style.overflow = "auto";
    body.style.overflow = "auto";
    html.style.touchAction = "auto";
    body.style.touchAction = "auto";
    body.style.overscrollBehavior = "auto";

    if (root) {
      root.style.overflow = "visible";
      root.style.height = "auto";
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
      body.style.overscrollBehavior = previousBodyOverscroll;

      if (root) {
        root.style.overflow = previousRootOverflow;
        root.style.height = previousRootHeight;
      }
    };
  }, []);
}

export default useEnableBrowserPageInteraction;
