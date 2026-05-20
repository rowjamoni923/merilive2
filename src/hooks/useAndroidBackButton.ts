import { useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { isAndroid, exitApp } from "@/utils/nativeUtils";

/**
 * Root pages where back press should NOT navigate further — instead show
 * "press again to exit" then exit. Everything else is a sub-page that goes
 * back one step (professional Android app behavior).
 */
const ROOT_PAGES = new Set<string>(['/', '/discover', '/live', '/chat', '/profile']);

/**
 * Auto-detect any open Radix overlay (Dialog / Sheet / DropdownMenu /
 * Popover / Select / AlertDialog / HoverCard / ContextMenu / Drawer).
 * Radix sets `data-state="open"` on its portalled content node.
 * Closing via `[data-radix-dialog-close]` etc. is unreliable, so we
 * synthesize an Escape keydown which every Radix overlay listens for.
 */
function dismissTopOverlayIfAny(): boolean {
  // 1) Explicit opt-in (preferred — for custom non-Radix overlays).
  const customDismissable = document.querySelector('[data-back-dismissable="true"]');
  if (customDismissable) {
    const ev = new CustomEvent('app:back', { cancelable: true });
    const allowed = customDismissable.dispatchEvent(ev);
    if (!allowed || ev.defaultPrevented) return true;
  }

  // 2) Radix-based overlays (Dialog, Sheet, AlertDialog, DropdownMenu,
  //    Popover, Select, ContextMenu, Drawer, HoverCard). All of these
  //    portal a node with [data-state="open"] and listen to Escape on
  //    the window. Dispatching Escape is the canonical way to close
  //    only the top-most overlay (Radix manages its own stack).
  const openOverlay = document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [data-radix-popper-content-wrapper] [data-state="open"], [data-vaul-drawer][data-state="open"]'
  );
  if (openOverlay) {
    const esc = new KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      keyCode: 27,
      which: 27,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(esc);
    return true;
  }

  return false;
}

/**
 * Global Android hardware back button handler.
 *
 * Priority order (professional Android behavior):
 *   1. Open overlay (dialog/sheet/menu/popover) → close it
 *   2. Sub-page                                  → navigate(-1)
 *   3. Root page                                  → double-tap to exit
 *
 * Must be mounted inside <BrowserRouter> at the app level.
 */
export function useAndroidBackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const lastBackPress = useRef<number>(0);
  const locationRef = useRef(location.pathname);
  const handlingRef = useRef(false);

  // Keep ref in sync so the listener always has fresh pathname
  useEffect(() => {
    locationRef.current = location.pathname;
  }, [location.pathname]);

  const handleBack = useCallback(async () => {
    // Re-entrancy guard — multiple Capacitor listeners can fire the same press.
    if (handlingRef.current) return;
    handlingRef.current = true;
    window.setTimeout(() => { handlingRef.current = false; }, 300);

    // 1) Top-most overlay closes first (one back press = one overlay).
    if (dismissTopOverlayIfAny()) return;

    const currentPath = locationRef.current;
    const isRootPage = ROOT_PAGES.has(currentPath);

    // 2) Root page: double-tap to exit (industry standard).
    if (isRootPage) {
      const now = Date.now();
      if (now - lastBackPress.current < 2000) {
        await exitApp();
      } else {
        lastBackPress.current = now;
        toast("Press back again to exit", { duration: 2000 });
      }
      return;
    }

    // 3) Sub-page: navigate one step back. Use the SPA history length to
    //    detect deep-link / replace-only entries that would otherwise let
    //    the WebView exit the app.
    const beforePath = currentPath;
    const hasHistory = window.history.length > 1;
    if (hasHistory) {
      navigate(-1);
      // Safety net — if React Router could not actually move (replace-only
      // history, blocked navigation, etc.) within 400ms, hop to home so we
      // never accidentally exit on a sub-page.
      window.setTimeout(() => {
        if (locationRef.current === beforePath) {
          navigate('/', { replace: true });
        }
      }, 400);
    } else {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!isAndroid()) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    const setup = async () => {
      try {
        const { App } = await import("@capacitor/app");
        const listener = await App.addListener("backButton", () => {
          // Always handle in JS — this suppresses Capacitor's default
          // (which is WebView.goBack() falling through to App.exitApp()).
          handleBack();
        });
        if (cancelled) {
          listener.remove();
          return;
        }
        cleanup = () => listener.remove();
      } catch (error) {
        console.error("[BackButton] Setup error:", error);
      }
    };

    setup();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [handleBack]);
}

