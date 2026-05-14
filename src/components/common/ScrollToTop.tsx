import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Resets window scroll on every pathname change so the next page (and its
 * Suspense fallback spinner) always render at the top of the viewport
 * instead of inheriting the previous route's scroll offset.
 *
 * Mounted once inside <BrowserRouter>.
 */
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // Use 'auto' (instant) — a smooth scroll during a route swap looks janky
    // and can collide with the new page's own scroll restoration.
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
};

export default ScrollToTop;
