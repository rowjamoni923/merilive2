---
name: pkg435-phase15-scroll-restoration
description: Pkg435 Phase 15 — native-feel back-nav scroll restoration. Forward nav scrolls to top, POP back nav restores the exact Y the user left at, persisted via sessionStorage with LRU cap and visibilitychange/pagehide safety.
type: feature
---
**Pkg435 — Phase 15 — Native scroll restoration** — DONE 2026-06-06.

Goal: when user taps Back, they land at the exact pixel they left at — like every native Android app and the browser's bfcache. Stops the "back from Profile → Home jumps to top of feed" jank.

`src/components/common/ScrollToTop.tsx` rewritten:
- `useNavigationType()` from react-router-dom branches PUSH/REPLACE vs POP.
- PUSH/REPLACE → `window.scrollTo(0,0)` (existing behaviour, top-of-page on every new screen).
- POP → reads saved Y for `pathname+search` key from `sessionStorage merilive-scroll:<key>` and restores it via two-pass `scrollTo` (immediate + rAF) so the new page doesn't paint at the wrong offset even if Suspense settles a frame later.
- Captures outgoing scroll BEFORE leaving (inside `useLayoutEffect` so it runs synchronously before the new page paints).
- Also persists on `visibilitychange=hidden` + `pagehide` so Android process-death restore works.
- LRU cap at 200 keys + index list (`merilive-scroll:__keys`) so sessionStorage never bloats.

Zero behaviour change for first-visit / forward nav. Pure JS, no native dependency, works on web + iOS + Android equally.
