---
name: pkg434-phase14-tab-keep-alive
description: Pkg434 Phase 14 — opt-in tab keep-alive host renders Home/Discover/Chat/Reels once on first visit then keeps them mounted via display:none for instant native-like tab swaps. Flag tabKeepAlive=on (default OFF).
type: feature
---
**Pkg434 — Phase 14 — Tab Keep-Alive Host** — DONE 2026-06-06.

Goal: native Android tab-swap feel (Bigo/Tango/TikTok) — zero spinner, zero refetch, scroll preserved, realtime subs never torn down when user switches between bottom-nav tabs.

NEW `src/components/TabKeepAliveHost.tsx` — single fixed-position host mounted once at App scope (above `<Routes>`) when authed + non-admin + non-public + flag ON. Lazy-mounts each of {Home `/`+`/index`, Discover, Chat, Reels} only on first visit, then keeps every visited tab in the React tree with `display:none` for inactive tabs (visible one gets `display:block`). When current path isn't a tab route, entire host goes `visibility:hidden + pointerEvents:none + zIndex:-1` so the rest of the app renders normally.

Wiring in `src/App.tsx`: import + conditional `<TabKeepAliveHost />` mount inside `<CallProvider>`. The 5 tab routes (`/`, `/index`, `/discover`, `/chat`, `/reels`) render an empty `<ProtectedRoute><></></ProtectedRoute>` placeholder when `isTabKeepAliveEnabled()` is true (ProtectedRoute still gates the URL, host renders the actual page). When flag is OFF — zero behaviour change, original lazy per-route mount path is preserved byte-for-byte.

**Default OFF.** Opt-in per device:
```
localStorage.setItem('tabKeepAlive','on'); location.reload();
```
Kill switch:
```
localStorage.removeItem('tabKeepAlive'); location.reload();
```

Risk profile: minimal. When OFF the only diff is an unused import + 5 unused ternaries. When ON, the only diff is that 4 tab pages co-exist in the DOM — they already do their own realtime cleanup on unmount, here they simply never unmount (which is the goal). Inactive `display:none` subtrees pause `<video>` autoplay heuristics naturally and don't paint, so GPU/CPU cost is negligible. iOS/web/older APKs behave identically to today since the flag is per-device localStorage.

Constraint: per Core rule, NEVER replaces realtime with polling — the whole point is that realtime channels survive across tab swaps because the component never unmounts.
