import { memo, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

const BLANK_GUARD_DELAY_MS = 160;

const isVisibleElement = (element: Element) => {
  const rect = element.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0.02;
};

const hasMeaningfulRouteSurface = () => {
  const selectors = [
    "[data-page]",
    "[data-page-root]",
    "main",
    "header",
    "nav",
    "button",
    "input",
    "textarea",
    "video",
    "img",
    "[role='dialog']",
    "[aria-busy='true']",
  ].join(",");

  const elements = Array.from(document.querySelectorAll(selectors))
    .filter((el) => !el.closest("[data-blank-screen-guard]"));

  if (elements.some(isVisibleElement)) return true;

  const root = document.getElementById("root");
  const visibleText = (root?.innerText || "").trim();
  return visibleText.length > 0;
};

const getSurfaceKind = (pathname: string) => {
  if (pathname.startsWith("/auth") || pathname.startsWith("/reset-password")) return "auth";
  if (
    pathname.startsWith("/live") ||
    pathname.startsWith("/party") ||
    pathname === "/go-live" ||
    pathname === "/live-session" ||
    pathname.startsWith("/call") ||
    pathname.startsWith("/active-call") ||
    pathname.startsWith("/incoming-call") ||
    pathname.startsWith("/outgoing-call") ||
    pathname.startsWith("/stream")
  ) return "live";
  return "app";
};

// Static painted app chrome — no spinner, no shimmer, no blank/white.
const GuardFallback = memo(({ kind }: { kind: "auth" | "live" | "app" }) => {
  if (kind === "live") {
    return (
      <div data-blank-screen-guard className="fixed inset-0 z-[2147483000]" style={{ backgroundColor: '#050208' }} aria-hidden="true">
        <div className="absolute left-4 right-4 pt-4" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full" style={{ backgroundColor: '#1a1422' }} />
            <div className="space-y-2">
              <div className="h-3 w-28 rounded" style={{ backgroundColor: '#1a1422' }} />
              <div className="h-3 w-16 rounded" style={{ backgroundColor: '#15101c' }} />
            </div>
          </div>
        </div>
        <div className="absolute left-4 right-4 pb-5 space-y-3" style={{ bottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="h-10 rounded-full" style={{ backgroundColor: '#1a1422' }} />
          <div className="flex justify-between">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-11 w-11 rounded-full" style={{ backgroundColor: '#1a1422' }} />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (kind === "auth") {
    return (
      <div data-blank-screen-guard className="fixed inset-0 z-[2147483000] overflow-hidden text-white" style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 42%, #24243e 72%, #0f0c29 100%)' }} aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/50" />
        <div className="relative z-10 flex min-h-screen flex-col justify-end gap-2 px-5 pb-8">
          <div className="mb-2 grid h-14 w-14 place-items-center rounded-[18px] bg-gradient-to-br from-purple-500 to-pink-500 text-2xl font-black shadow-[0_18px_50px_rgba(236,72,153,0.35)]">M</div>
          <h1 className="m-0 text-[30px] font-black leading-none tracking-normal">meriLIVE</h1>
          <p className="mb-3 text-sm font-semibold text-white/80">Connect • Chat • Share</p>
          <div className="flex h-10 items-center justify-center rounded-2xl bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 text-sm font-bold shadow-[0_12px_34px_rgba(0,0,0,0.22)]">Get Started</div>
          <div className="flex h-10 items-center justify-center rounded-2xl bg-gradient-to-r from-green-500 via-emerald-500 to-green-600 text-sm font-semibold shadow-[0_12px_34px_rgba(0,0,0,0.18)]">Continue with Phone</div>
          <div className="flex h-10 items-center justify-center rounded-2xl bg-white/95 text-sm font-semibold text-slate-900 shadow-[0_12px_34px_rgba(0,0,0,0.18)]">Continue with Email</div>
          <div className="mt-1 text-center text-[11px] font-semibold text-white/75">I agree to the Terms of Service & Privacy Policy • 18+</div>
        </div>
      </div>
    );
  }
  return (
    <div data-blank-screen-guard className="fixed inset-0 z-[2147483000] flex flex-col bg-background" aria-hidden="true">
      <div className="flex items-center gap-3 border-b border-border bg-card px-4" style={{ height: 56 }}>
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 text-sm font-black text-white">M</div>
        <div className="text-lg font-black tracking-normal text-slate-900">meriLIVE</div>
        <div className="ml-auto flex items-center gap-2 text-lg"><span>🔍</span><span>💬</span></div>
      </div>
      <div className="flex-1 overflow-hidden px-4 pt-4 space-y-3">
        <div className="rounded-2xl bg-gradient-to-r from-pink-500 to-amber-400 p-4 text-white shadow-sm">
          <div className="text-xl font-black tracking-normal">Live now</div>
          <div className="text-sm font-semibold text-white/85">Discover hosts and rooms instantly</div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-slate-900">
          <div className="h-36 rounded-2xl bg-card p-3 shadow-sm"><div className="text-2xl">🎥</div><div className="mt-8 font-bold text-foreground">Live</div></div>
          <div className="h-36 rounded-2xl bg-card p-3 shadow-sm"><div className="text-2xl">🎉</div><div className="mt-8 font-bold text-foreground">Party</div></div>
        </div>
        <div className="rounded-2xl bg-card p-4 text-foreground shadow-sm"><div className="font-bold">Recommended</div><div className="mt-1 text-sm text-muted-foreground">Rooms, chats, gifts and creators</div></div>
      </div>
      <div className="flex items-center justify-around border-t border-border bg-card px-2" style={{ height: 64 }}>
        {['🏠', '🎥', '💬', '🎁', '👤'].map((icon, i) => (
          <div key={i} className="flex h-10 w-10 items-center justify-center rounded-xl text-xl">{icon}</div>
        ))}
      </div>
    </div>
  );
});

GuardFallback.displayName = "GuardFallback";

export const BlankScreenGuard = memo(() => {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);
  const visibleRef = useRef(false);

  const setGuardVisible = (next: boolean) => {
    visibleRef.current = next;
    setVisible(next);
  };

  useEffect(() => {
    setGuardVisible(false);

    if (timerRef.current) window.clearTimeout(timerRef.current);

    const armBlankCheck = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        if (!hasMeaningfulRouteSurface()) setGuardVisible(true);
      }, BLANK_GUARD_DELAY_MS);
    };

    armBlankCheck();

    const observer = new MutationObserver(() => {
      if (hasMeaningfulRouteSurface()) {
        if (timerRef.current) window.clearTimeout(timerRef.current);
        if (visibleRef.current) setGuardVisible(false);
        return;
      }
      if (!visibleRef.current) armBlankCheck();
    });

    const root = document.getElementById("root");
    if (root) observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      observer.disconnect();
    };
  }, [location.pathname, location.search]);

  return visible ? <GuardFallback kind={getSurfaceKind(location.pathname)} /> : null;
});

BlankScreenGuard.displayName = "BlankScreenGuard";

export default BlankScreenGuard;