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

// 🚀 AGGRESSIVE PREFETCH — Start downloading ALL routes immediately after first paint
// This makes EVERY page navigation feel instant (<100ms)
if (typeof window !== 'undefined') {
  const prefetchAllRoutes = () => {
    // Tier 1: Most-used routes (load first)
    const tier1 = [
      () => import('./pages/Profile'),
      () => import('./pages/Chat'),
      () => import('./pages/Discover'),
      () => import('./pages/Live'),
      () => import('./pages/Reels'),
    ];
    // Tier 2: Common navigation
    const tier2 = [
      () => import('./pages/PartyRooms'),
      () => import('./pages/GoLive'),
      () => import('./pages/Recharge'),
      () => import('./pages/Settings'),
      () => import('./pages/EditProfile'),
      () => import('./pages/Tasks'),
      () => import('./pages/Shop'),
      () => import('./pages/VIP'),
      () => import('./pages/Level'),
      () => import('./pages/Leaderboard'),
      () => import('./pages/SearchUsers'),
      () => import('./pages/CallHistory'),
    ];
    // Tier 3: Less common but still needed
    const tier3 = [
      () => import('./pages/Agency'),
      () => import('./pages/AgencyDashboard'),
      () => import('./pages/ProfileDetail'),
      () => import('./pages/Invitation'),
      () => import('./pages/CreateParty'),
      () => import('./pages/PartyRoom'),
      () => import('./pages/LiveStream'),
      () => import('./pages/FollowingList'),
      () => import('./pages/HostDashboard'),
      () => import('./pages/Rewards'),
      () => import('./pages/RechargeHistory'),
    ];

    const loadTier = (tier: Array<() => Promise<unknown>>, delay: number) => {
      tier.forEach((fn, i) => setTimeout(() => fn().catch(() => {}), delay + i * 30));
    };

    loadTier(tier1, 0);     // Start immediately when idle
    loadTier(tier2, 800);   // After tier 1 mostly done
    loadTier(tier3, 2000);  // Last
  };

  // Use requestIdleCallback if available — never block first paint
  if (typeof (window as any).requestIdleCallback === 'function') {
    (window as any).requestIdleCallback(prefetchAllRoutes, { timeout: 2000 });
  } else {
    setTimeout(prefetchAllRoutes, 500);
  }

  // Prefetch admin chunks ONLY when admin path detected (saves bandwidth for users)
  if (window.location.pathname.startsWith('/admin')) {
    const prefetchAdmin = () => {
      Promise.all([
        import('./pages/admin/AdminLayout'),
        import('./pages/admin/AdminDashboard'),
        import('./pages/admin/AdminUserManagement'),
        import('./pages/admin/AdminAgencies'),
        import('./pages/admin/AdminWithdrawals'),
        import('./pages/admin/AdminRechargeHistory'),
      ]).catch(() => {});
    };
    if (typeof (window as any).requestIdleCallback === 'function') {
      (window as any).requestIdleCallback(prefetchAdmin, { timeout: 1500 });
    } else {
      setTimeout(prefetchAdmin, 300);
    }
  }
}

