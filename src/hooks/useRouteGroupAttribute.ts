import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Tags <body data-route-group="..."> so CSS can scope native-feel
 * polish (tap feedback, page-enter motion, momentum scroll) per area
 * without per-page wiring. Agency / Host / Country-admin pages get
 * the same smooth feel as the main app shell.
 */
function resolveGroup(pathname: string): string {
  if (
    pathname.startsWith("/agency") ||
    pathname.startsWith("/join-agency") ||
    pathname.startsWith("/create-agency") ||
    pathname.startsWith("/become-sub-agent") ||
    pathname.startsWith("/agent-wallet") ||
    pathname.startsWith("/agent-rank") ||
    pathname.startsWith("/host-dashboard") ||
    pathname.startsWith("/host-application") ||
    pathname.startsWith("/host-transfer-history") ||
    pathname.startsWith("/country-admin")
  ) {
    return "agency";
  }
  if (pathname.startsWith("/admin")) return "admin";
  return "main";
}

export function useRouteGroupAttribute() {
  const { pathname } = useLocation();
  useEffect(() => {
    const group = resolveGroup(pathname);
    document.body.dataset.routeGroup = group;
    // Trigger a one-shot enter animation by re-keying the data attribute.
    document.body.dataset.routeKey = String(Date.now());
    return () => {
      // keep value on unmount; next route will overwrite
    };
  }, [pathname]);
}
