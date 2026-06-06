import React from "react";
import { createRoot } from "react-dom/client";
import { installRealtimeGuard } from "./utils/realtimeGuard";
import { installAuthRequestGuard } from "./utils/authRequestGuard";
import { startNetworkResilienceEngine } from "./utils/networkResilienceEngine";
import { installAudioUnlock } from "./utils/audioUnlock";
import { scheduleChunkLoadRecovery } from "./utils/lazyRetry";
import { installGlobalMediaSrcNormalizer } from "./utils/installGlobalMediaSrcNormalizer";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { initLocalizationEngine } from "./i18n/engine";
initLocalizationEngine();
import { initializeNativeApp, isNativeApp } from "./utils/nativeUtils";
import { installColdStartCapture } from "./utils/coldStartCapture";
import { isStandalonePublicLocation } from "./utils/publicRoutes";
import { applyLowEndMotionClass } from "./utils/lowEndDevice";

// 🐌 Tag <html> with .reduce-motion on budget Android / data-saver / OS
// reduced-motion so global CSS + framer-motion's MotionConfig can throttle
// expensive animations on low-end hardware. Cheap, sync, runs once.
applyLowEndMotionClass();

// =============================================
// 🛡️ CRITICAL: Non-blocking initializations
// =============================================
const schedule = (cb: () => void) => {
  if (typeof (window as any).requestIdleCallback === 'function') {
    (window as any).requestIdleCallback(cb, { timeout: 2000 });
  } else {
    setTimeout(cb, 100);
  }
};

installRealtimeGuard();
installGlobalMediaSrcNormalizer();
installAuthRequestGuard();

schedule(() => {
  if (!window.location.pathname.startsWith('/admin') && !isStandalonePublicLocation()) {
    startNetworkResilienceEngine();
  }
  installAudioUnlock();
});

// 🛡️ GLOBAL CRASH GUARDS — swallow async errors so the app never goes blank.
// React render errors are still caught by the in-tree <ErrorBoundary>.
window.addEventListener('error', (e) => {
  try { console.error('[global error]', e.error || e.message); } catch { /* noop */ }
  void scheduleChunkLoadRecovery(e.error || e, String(e.message || ''));
  // Prevent default browser "Uncaught" overlay that can stall WebViews
  e.preventDefault?.();
});
window.addEventListener('unhandledrejection', (e) => {
  const reason: any = e.reason;
  // Quiet expected LiveKit lifecycle errors (stream ended, viewer not yet entered, etc.)
  const isQuiet = reason && (reason.quiet === true || ['stream_inactive', 'must_enter_stream_first'].includes(reason.code));
  if (!isQuiet) {
    try { console.error('[unhandled promise]', reason); } catch { /* noop */ }
  }
  void scheduleChunkLoadRecovery(reason, String(reason?.message || reason || ''));
  e.preventDefault?.();
});



// =============================================
// MOBILE VIEWPORT HEIGHT FIX
// Fixes 100vh issue on mobile browsers (address bar)
// =============================================
function setViewportHeight() {
  if (window.location.pathname.startsWith('/admin') || isStandalonePublicLocation()) return;
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

// Set on load
setViewportHeight();

// Update on resize and orientation change
window.addEventListener('resize', setViewportHeight);
window.addEventListener('orientationchange', () => {
  // Delay to ensure orientation change is complete
  setTimeout(setViewportHeight, 100);
});

// Also update on visual viewport resize (mobile browser address bar)
if ('visualViewport' in window && window.visualViewport) {
  window.visualViewport.addEventListener('resize', setViewportHeight);
}

// Initialize native app features - non-blocking
if (isNativeApp()) {
  // Pkg434 Pass 3 — capture cold-start push tap / deep link BEFORE React mounts
  // so the user lands on the intended chat/call/live screen instead of home.
  installColdStartCapture();

  // Don't await - let it run in background
  initializeNativeApp().catch(console.error);

  // domainFallback removed — app runs from local dist/.
  // No browser redirect. Everything stays inside the app.
}

// Prevent default touch behaviors for native feel
document.addEventListener('touchstart', () => {}, { passive: true });

// Render app immediately
const container = document.getElementById("root");
if (container) {
  try {
    try { (window as any).__meriliveBooted?.(); } catch { /* ignore */ }
    const root = createRoot(container);
    root.render(<App />);
    // Tell the boot watchdog (in index.html) that React mounted successfully —
    // this cancels the 15s blank-screen fallback. Also force-hide the native
    // splash so slow/old WebView devices don't stay stuck on it.
    requestAnimationFrame(() => {
      try { (window as any).__meriliveBooted?.(); } catch { /* ignore */ }
      if (isNativeApp()) {
        import('@capacitor/splash-screen')
          .then(({ SplashScreen }) => SplashScreen.hide().catch(() => {}))
          .catch(() => {});
      }
    });
  } catch (err) {
    console.error('[boot] React mount failed:', err);
    // Leave fallback watchdog to render the recovery UI
  }
}

// Route chunks are warmed from App/Navigation after first paint. Keeping main.tsx
// lean prevents the cold-start script storm that made pages appear to load slowly.

