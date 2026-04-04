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
    const isRootPage = ROOT_PAGES.includes(currentPath);

    if (isRootPage) {
      const now = Date.now();
      if (now - lastBackPress.current < 2000) {
        await exitApp();
      } else {
        lastBackPress.current = now;
        toast("Press again to exit", { duration: 2000 });
      }
    } else {
      // Navigate back through history stack
      navigate(-1);
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
