# Android UI Hardening — App-wide Stability Pass

96 pages in `src/pages`। "কোন UI না ভাঙা" মানে ৯৬টা page individually ঘষা নয় — cross-cutting foundation ঠিক থাকলে সব page একসাথে ঠিক হয়। Chamet/Bigo/Poppo-এর মতো apps যে ৪টা layer-এ smooth থাকে, সেগুলোই fix করছি।

## Phase 1 — Keyboard & Input (সবথেকে বড় pain point)

Chamet/WhatsApp behaviour:
- Input উপরে উঠবে, background compress হবে না।
- Chat/comment box keyboard-এর ঠিক উপরে থাকবে।
- Back gesture → keyboard hide, page না ছেড়ে।

Deliverables:
- `@capacitor/keyboard` plugin install + `Keyboard.setResizeMode({ mode: 'native' })` + `setScrollEnabled(false)`।
- Global `useKeyboardInsets()` hook → `--kb-height` CSS variable expose।
- Chat / Comment / DM / Support / PartyRoom / LiveStream comment composer-এ `padding-bottom: var(--kb-height)` wire।
- iOS-parity `enterkeyhint` + `inputmode` audit।
- Android manifest `windowSoftInputMode="adjustResize"` verify।

## Phase 2 — Safe-Area & Notch/Gesture-Bar

- `viewport-fit=cover` in `index.html` (already?)। Verify।
- Global CSS tokens: `--safe-top`, `--safe-bottom`, `--safe-left`, `--safe-right` → `env(safe-area-inset-*)`।
- All fixed headers/footers/bottom-navs → `padding-top: var(--safe-top)` / `padding-bottom: var(--safe-bottom)`।
- Sheet/Dialog/BottomSheet component audit → automatic safe-area।

## Phase 3 — Layout Stability

- Fixed viewport height bug: `100vh` → `100dvh` (dynamic viewport) app-wide replace।
- Image `width`/`height` attribute audit → prevent CLS।
- Long list → `react-window`/`react-virtual` audit (Chat threads, Follower lists, Gift history)।
- Overflow-x hidden root guard → horizontal scroll leak কখনো হবে না।
- Touch target minimum 44×44px audit (Tailwind size tokens)।

## Phase 4 — Perf & Smoothness

- React Query `staleTime` audit → duplicate refetch কমাবে।
- Route-level `React.lazy` + `Suspense` for heavy pages (Reels, LiveStream, PartyRoom already lazy)।
- Image lazy loading + `decoding="async"` audit।
- Framer Motion → `will-change` + `transform` GPU path verify।
- WebView hardware acceleration flag (Capacitor default ON, verify)।
- Font loading: `font-display: swap` + preload primary font।

## Verification Protocol

- Owner-account test on preview (smdollarex923@gmail.com) - top 15 flows: Home, Live, GoLive, Party, PrivateCall, Chat, DM, Support, Wallet, Recharge, Profile, Reels, Discover, Search, Settings।
- Playwright headless viewport 393×852 (Pixel-8) screenshot pass — visual diff → broken layout detect।
- APK rebuild + physical device smoke test (user side)।

## Technical Details

```
Phase 1 files touched:
  - capacitor.config.ts (Keyboard plugin config)
  - src/hooks/useKeyboardInsets.ts (NEW)
  - src/index.css (--kb-height token)
  - android/app/src/main/AndroidManifest.xml (adjustResize)
  - ~15 composer components (padding-bottom wire)

Phase 2 files touched:
  - src/index.css (safe-area tokens)
  - src/components/layout/* (header/footer wire)
  - src/components/ui/sheet.tsx, dialog.tsx (safe-area)

Phase 3-4 = codemod-style sweeps across src/**/*.tsx.
```

## Scope Boundaries

- Design SACRED — colors, fonts, layout composition অক্ষত। শুধু stability primitive যোগ।
- Camera/LiveKit/VAP/SVGA/native gift animation code touch হবে না।
- Web + Android দুই platform-এ কাজ করবে (iOS bonus)।
- Admin panel already separate performance-locked → skip।

## Approach Question

৪ Phase একসাথে করব, নাকি Phase 1 (keyboard — সবথেকে বড় সমস্যা) দিয়ে শুরু করে user verify করার পর ধাপে ধাপে? Approve করলে জানাও কোনটা।
