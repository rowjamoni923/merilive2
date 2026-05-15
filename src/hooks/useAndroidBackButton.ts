import { useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { isAndroid, exitApp } from "@/utils/nativeUtils";

const ROOT_PAGES = ['/', '/discover', '/live', '/chat', '/profile'];

/**
 * Global Android hardware back button handler.
 * - On root pages: double-tap to exit
 * - On sub-pages: navigate back through history
 * 
 * Must be mounted inside <BrowserRouter> at the app level.
 */
export function useAndroidBackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const lastBackPress = useRef<number>(0);
  const locationRef = useRef(location.pathname);

  // Keep ref in sync so the listener always has fresh pathname
  useEffect(() => {
    locationRef.current = location.pathname;
  }, [location.pathname]);

  const handleBack = useCallback(async () => {
    const currentPath = locationRef.current;

    // 1) If any in-app overlay/modal/sheet is open, close it first (one step).
    //    Components opt-in by setting [data-back-dismissable="true"] on their root
    //    and listening to the 'app:back' CustomEvent.
    const dismissable = document.querySelector('[data-back-dismissable="true"]');
    if (dismissable) {
      const ev = new CustomEvent('app:back', { cancelable: true });
      const allowed = dismissable.dispatchEvent(ev);
      if (!allowed || ev.defaultPrevented) return;
    }

    const isRootPage = ROOT_PAGES.includes(currentPath);

    if (isRootPage) {
      const now = Date.now();
      if (now - lastBackPress.current < 2000) {
        await exitApp();
      } else {
        lastBackPress.current = now;
        toast("Press again to exit", { duration: 2000 });
      }
      return;
    }

    // 2) Sub-page: always go ONE step back. If history is empty (deep link /
    //    after `navigate(..., { replace: true })`), fall back to home instead
    //    of letting the WebView exit the app.
    const beforePath = currentPath;
    const hasHistory = window.history.length > 1;
    if (hasHistory) {
      navigate(-1);
      // Safety net: if pathname did not change within 350ms, history was
      // exhausted — route to home so we never accidentally exit.
      window.setTimeout(() => {
        if (locationRef.current === beforePath) {
          navigate('/', { replace: true });
        }
      }, 350);
    } else {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!isAndroid()) return;

    let cleanup: (() => void) | undefined;

    const setup = async () => {
      try {
        const { App } = await import("@capacitor/app");

        const listener = await App.addListener("backButton", () => {
          handleBack();
        });

        cleanup = () => {
          listener.remove();
        };
      } catch (error) {
        console.error("[BackButton] Setup error:", error);
      }
    };

    setup();

    return () => {
      cleanup?.();
    };
  }, [handleBack]);
}
