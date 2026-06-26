/**
 * ScrollSafetyNet
 *
 * Mount once inside <BrowserRouter>. Whenever the route changes to a path
 * that does NOT own the native camera/call surface, clear any leaked body
 * classes (call-overlay-active / native-media-active / lk-camera-live /
 * native-face-camera-active / route-changing) and inline body/html overflow
 * locks left behind by a previous live/party/call screen or by a modal that
 * forgot to clean up. Without this, those leaked styles make every
 * subsequent page un-scrollable.
 *
 * Camera handoff between /go-live and /live/* and within /party/* /
 * /game-party/* / /video-party/* / /match/* / /private-call/* /
 * /face-verification is preserved — those routes own the surface flags
 * themselves and we deliberately skip cleanup while the user is inside them.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const CAMERA_OWNER_PATTERNS = [
  /^\/go-live(\/|$)/,
  /^\/live(\/|$)/,
  /^\/party(\/|$)/,
  /^\/video-party(\/|$)/,
  /^\/game-party(\/|$)/,
  /^\/match(\/|$)/,
  /^\/private-call(\/|$)/,
  /^\/call(\/|$)/,
  /^\/face-verification(\/|$)/,
];

const LEAKED_BODY_CLASSES = [
  "call-overlay-active",
  "native-media-active",
  "lk-camera-live",
  "native-face-camera-active",
  "route-changing",
];

const isCameraOwnerRoute = (path: string) =>
  CAMERA_OWNER_PATTERNS.some((re) => re.test(path));

export function ScrollSafetyNet() {
  const location = useLocation();

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isCameraOwnerRoute(location.pathname)) return;

    const body = document.body;
    const html = document.documentElement;

    LEAKED_BODY_CLASSES.forEach((cls) => {
      if (body.classList.contains(cls)) body.classList.remove(cls);
      if (html.classList.contains(cls)) html.classList.remove(cls);
    });

    // Clear inline overflow locks left by modal libraries that didn't unmount
    // cleanly. CSS in index.css restores natural scroll behavior afterwards.
    if (body.style.overflow === "hidden") body.style.overflow = "";
    if (html.style.overflow === "hidden") html.style.overflow = "";
    if (body.hasAttribute("data-scroll-locked")) {
      body.removeAttribute("data-scroll-locked");
    }
  }, [location.pathname]);

  return null;
}

export default ScrollSafetyNet;
