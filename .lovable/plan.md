
# App-wide Performance Overhaul — Honest Plan

## Real numbers I just measured (preview, full network)

| Metric | Current | Pro target (Chamet/Bigo class) |
|---|---|---|
| FCP (First Contentful Paint) | **11.4s** | < 1.8s |
| DOM Content Loaded | **7.8s** | < 2.5s |
| Total JS on first paint | **2.37 MB** across 246 scripts | < 600 KB |
| Script execution on boot | **2.23s** | < 400ms |
| Total main-thread task time | **12.25s** | < 2s |
| Largest single chunk | `App.tsx` = 99 KB (route table alone) | < 30 KB per route |
| Heap on idle home | 75 MB | < 40 MB |
| Source files | 1,255 (.ts/.tsx) | — |
| Files using `useEffect/useState` | 641 | — |

**Honest verdict:** the app is heavy because the entire route table, every shadcn icon (`lucide-react` barrel = 157 KB), the full Supabase client, the full LiveKit client, every page component, and a 95 KB `index.css` all get evaluated on first paint. That is the root cause of "lag even on full network" — not the network, the bundle.

## What I will NOT do

- I will **not** claim to "fix 600 sections in one pass". That is dishonest. No professional engineer ships a 1,200-file refactor in one shot without regression.
- I will **not** touch design / copy / animations (memory rule: design is sacred).
- I will **not** change LiveKit / camera / call logic (just stabilized).
- I will **not** add polling or visibility-refresh workarounds.

## What I WILL do — 4 phases, each shippable and measurable

### Phase 1 — Bundle & boot (biggest win, lowest risk) — ~target: FCP 11.4s → < 3s
1. **Lucide tree-shake**: replace `import { Icon } from 'lucide-react'` (barrel, 157 KB) with `lucide-react/icons/icon-name` deep imports across the 50 heaviest files. Saves ~120 KB on first paint.
2. **Route-level code-split audit**: `App.tsx` is 99 KB because some routes still resolve eagerly. Audit the `lazy()` table, convert any remaining eager imports, and add `webpackPrefetch`-style idle prefetch only for the next-likely route (Home → Live, Home → Chat).
3. **Split `index.css`** (95 KB): extract per-feature CSS (party/live/call/games) into route-scoped CSS modules so home doesn't pay for them.
4. **Defer Supabase realtime channels** until after FCP (not before). Auth session check stays eager.
5. **Drop dead vendor code**: scan for unused deps and unused imports project-wide via `knip` (read-only audit first, then surgical removal).

**Verification:** re-run `browser--performance_profile` after each step; require FCP < 3s before moving on.

### Phase 2 — Runtime jank (interaction lag) — target: INP < 200ms everywhere
1. Wrap the 5 heaviest list pages (Index/Home, Chat, FollowingList, SearchUsers, Reels) in `react-window` virtualization. Currently they render hundreds of `UserCard`s synchronously.
2. Add `useDeferredValue` to search inputs (Chat search, User search, Gift picker).
3. Audit the top 20 `useEffect` chains with `lsp--code_intelligence` for redundant re-subscriptions (dup Supabase channels = dup CPU + dup network).
4. Memoize the 10 heaviest components (`UserCard`, `LiveCard`, `PartySeat`, `GiftItem`, `ChatBubble`, etc.) with `React.memo` + stable prop refs.

**Verification:** record a 5s profile while scrolling Home + opening Chat; require no long task > 200ms.

### Phase 3 — Network discipline — target: no duplicate requests, all critical data prefetched
1. Map every Supabase Realtime subscription, dedupe duplicates (some tables are subscribed in 3+ places — confirmed from earlier audits).
2. Move TanStack Query `staleTime` defaults from `0` to feature-appropriate values (profiles 60s, settings 10min, gifts 30min).
3. Prefetch the user's most-likely-next page on idle (Home → recent chat partners, Home → followed lives).
4. Compress all `public/` PNG assets with `squoosh` (one-time) and add `loading="lazy"` to off-screen images.

### Phase 4 — Two-UI overlap & route-transition guarantees (extends the call-vs-live fix already shipped)
1. Add a single `<TopLayerHost />` that owns the global modal/sheet stack with deterministic z-order (no more random `z-[99]`/`z-[100]` collisions across 80+ overlays).
2. Add `aria-modal` + `inert` on background routes when a full-screen overlay is open (also a11y win).
3. Add a `useExclusiveSession()` hook so live/party/call/games can never have 2 active simultaneously (extends the `RequireNoActiveCall` guard).

## Honest scope & timing

| Phase | Files touched | Risk | What I can verify in Lovable | Owner-account testable |
|---|---|---|---|---|
| 1 | ~60 | Low | ✅ FCP / bundle size before+after | ✅ |
| 2 | ~30 | Medium | ✅ profiler scroll trace | ✅ |
| 3 | ~40 | Medium | ⚠️ partial (realtime needs prod load) | ✅ partial |
| 4 | ~15 | Low | ✅ | ✅ |

No APK rebuild needed for Phases 1–4 — all React/Vite/CSS layer. Native Android perf (Camera2, LiveKit) is already in the separate native-pro track.

## What I need from you to start

Pick one:

- **(A) Ship Phase 1 now** — biggest visible win (boot 11s → ~3s), 1 message, ~60 files, no risk to design or features. I run profile before/after and report numbers honestly.
- **(B) Ship Phase 1+2 back-to-back** — boot fix + interaction fix. Bigger blast radius, I verify each step.
- **(C) Full 4-phase rollout** — I work through them sequentially across multiple messages, profile after each, and stop if any regression appears. Most honest path but takes several turns.

আমার suggestion: **option A দিয়ে শুরু কর।** এক message এ measurable boot fix পাবি (FCP 11s → 3s target), তারপর সেটা real device এ test করে পরের phase যাবো। এতে কোনো false claim থাকবে না — প্রতিটা step এ profiler দিয়ে before/after number দেখাবো।
