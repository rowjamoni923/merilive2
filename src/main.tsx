import React from "react";
import { createRoot } from "react-dom/client";
import { installRealtimeGuard } from "./utils/realtimeGuard";
import { installAuthRequestGuard } from "./utils/authRequestGuard";
import { startNetworkResilienceEngine } from "./utils/networkResilienceEngine";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { initializeNativeApp, isNativeApp } from "./utils/nativeUtils";

// =============================================
// 🛡️ CRITICAL: Install realtime guard BEFORE anything else
// This prevents non-publication tables from creating DB connections
// =============================================
installRealtimeGuard();
installAuthRequestGuard();
startNetworkResilienceEngine();

// =============================================
// MOBILE VIEWPORT HEIGHT FIX
// Fixes 100vh issue on mobile browsers (address bar)
// =============================================
function setViewportHeight() {
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
  // Don't await - let it run in background
  initializeNativeApp().catch(console.error);
  
  // ❌ domainFallback সরানো হয়েছে — অ্যাপ local dist/ থেকে চলবে
  // browser এ redirect করবে না। সব কিছু অ্যাপের ভিতরেই থাকবে।
}

// Prevent default touch behaviors for native feel
document.addEventListener('touchstart', () => {}, { passive: true });

// Render app immediately
const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

// Prefetch only after user interaction (not on load)
// This prevents bandwidth/CPU waste during initial load
if (typeof window !== 'undefined') {
  // Only prefetch critical routes after first user interaction
  const prefetchOnInteraction = () => {
    window.removeEventListener('click', prefetchOnInteraction);
    window.removeEventListener('touchstart', prefetchOnInteraction);
    // Prefetch top routes after first interaction
    requestIdleCallback?.(() => {
      import('./pages/Profile');
      import('./pages/Chat');
      import('./pages/Discover');
      import('./pages/Live');
    }) ?? setTimeout(() => {
      import('./pages/Profile');
      import('./pages/Chat');
      import('./pages/Discover');
      import('./pages/Live');
    }, 300);
  };
  window.addEventListener('click', prefetchOnInteraction, { once: true });
  window.addEventListener('touchstart', prefetchOnInteraction, { once: true, passive: true });
}
