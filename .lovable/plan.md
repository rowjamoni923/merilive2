# App-Wide Performance Plan — "Chamet-class smooth, zero lag"

## লক্ষ্য
যেকোনো page (Home / Live / Party / Reels / Chat / Wallet / Profile) — full net speed-এ instant load, zero jank, smooth scroll, smooth animation। কোনো guesswork না — measure → fix → verify।

## বর্তমান অবস্থা (quick audit)
- **335 routes**, App.tsx 1558 lines — সব route eagerly bundled (zero `React.lazy`) → প্রথম load-এ পুরো app ডাউনলোড হয়
- **112 npm deps** — মধ্যে heavy: three/r3f, mediapipe, tencent webar, livekit, firebase, svgaplayerweb, svga.lite, lottie, framer-motion, remotion — সব main bundle-এ
- **245 ফাইলে console.log** — production-এ DevTools open থাকলে চরম slowdown
- **largest pages 3000-4500 lines** (LiveStream, Recharge, Chat, Profile, Auth) — monolithic, প্রচুর re-render risk
- types.ts **20k lines** — TS server slow করে, runtime impact নাই

---

## Phase 0 — Measurement (no code change)
Promise নয়, data থেকে fix করব।
1. `browser--performance_profile` — Web Vitals (LCP/INP/CLS), long tasks, DOM size, resource waterfall
2. `browser--start_profiling` → scroll Home / open Live / open Party → `stop_profiling` → top self-time functions
3. Network waterfall → identify >200KB chunks, blocking requests, slow Supabase queries
4. `npx vite build --report` (analyzer) → real bundle map
5. Output: ranked bottleneck list (worst-first), measurable baseline numbers

## Phase 1 — Bundle splitting (biggest single win, ~60-80% TTI drop)
1. **Route-level `React.lazy`** for all 335 routes in App.tsx + global `<Suspense>` with branded skeleton
2. **Defer heavy widgets**:
   - Three.js / R3F → dynamic import only when 3D scene mounts
   - MediaPipe / Tencent WebAR / beauty filters → load only when camera opens
   - SVGA / Lottie / VAP players → already dynamic? verify; else dynamic
   - Remotion → never ship to user bundle (build-time only — confirm)
3. **vite manualChunks** — split vendor: `react`, `livekit`, `supabase`, `firebase`, `ui-radix`, `motion`, `media` (three+mediapipe+svga)
4. Preload critical chunks (Home + Auth) with `<link rel="modulepreload">`

## Phase 2 — Render performance
1. **Strip 245 console.log** in production via vite `esbuild.drop: ['console','debugger']`
2. **Memoize** hot lists (HomeFeed cards, Chat messages, ViewerList, GiftGrid) — `React.memo` + stable keys + `useCallback` on handlers
3. **Virtualize long lists** — react-virtuoso for: Chat messages, Reels feed, ViewerList, transactions, leaderboard
4. **Split monolith pages** (LiveStream 4466 lines, Chat 3695, Recharge 4005) into route-level sub-modules so re-render scope shrinks
5. **Debounce/throttle** scroll, resize, search inputs; `useTransition` for tab switches

## Phase 3 — Network & data
1. **React Query** defaults: `staleTime: 30s`, `gcTime: 5min`, `refetchOnWindowFocus: false` (sane defaults for live app)
2. **Supabase**: verify indexes on hot queries (live_streams, party_rooms, messages, transactions); use `select('specific,columns')` not `*`; paginate everything >50 rows
3. **Image pipeline**: lazy `<img loading="lazy" decoding="async">`, explicit `width/height` (CLS=0), prefer WebP/AVIF, sizes attribute for responsive
4. **SW cache** for static assets only (no HTML cache — Lovable handles it)
5. **Preconnect** `<link rel="preconnect">` for Supabase + LiveKit + CDN origins in index.html

## Phase 4 — Animation & GPU
1. Audit `framer-motion` usage — heavy `AnimatePresence` lists → switch to CSS transforms
2. Ensure animations use `transform`/`opacity` only (composite layer), avoid `width/height/top/left` animation
3. `will-change` ONLY during active animation, remove after
4. Limit concurrent SVGA/Lottie players (already capped to 3 in native pipeline — mirror on web)

## Phase 5 — Verify (per phase + final)
- Re-run `browser--performance_profile` after each phase → record delta
- Lighthouse mobile (throttled 4G) on Home/Live/Party → target: LCP <2.5s, INP <200ms, CLS <0.1
- Manual smoke: Home scroll, Live join, Party join, Chat send, Gift send — must feel instant on owner test account
- Build size before/after report

---

## Execution order & safety
- One phase per turn, measure before & after, never bulk-edit blindly
- **Never touch** existing realtime subscriptions (replace with polling = forbidden per memory)
- **Never touch** LiveKit / gift / entry animation logic except to lazy-load
- Backend untouched in Phase 1-2; Phase 3 may add indexes via migration with user approval
- English-only UI strings (per memory)

## Out of scope (won't do unless asked)
- VPS work (deferred per memory)
- LiveKit migration (already self-hosted)
- New features, redesigns, copy changes
- Android-native code

## প্রথম step
Approve করলে **Phase 0 measurement** চালাব (browser profile + bundle analyzer) — তখন এই plan-কে real numbers দিয়ে update করে Phase 1-এ যাব।
