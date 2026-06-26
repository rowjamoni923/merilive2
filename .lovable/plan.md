# Goal
প্রত্যেকটা section (gift, live, party, private call, message, profile details) এ instant feel — SVGA / VIP / VAP gift animation tap-থেকে-frame ≤ 0–100 ms, zero black flash, zero "loading…", zero spinner.

আগের কাজ যা already shipped:
- **4A** — gift toast false-fail fix (idempotency polling)
- **4B** — panel-open prefetch (icons + top 8 VAP)
- **4C** — IndexedDB icon cache (`SmartGiftIcon`)
- **PersistentCameraSurface** — camera continuity across UI transitions
- **Prefetch hooks** for gifts + balance + room snapshots

এখন বাকি গুলো এক pass-এ ship হবে।

---

# Phase 5 — App-launch warmup (zero-latency)

**5.1 Boot prefetcher (`src/utils/bootWarmup.ts`)**
App launch + auth ready হওয়ার পরে background-এ (idle-callback) একবার চালাবে:
- Top 24 gift icons → `giftIconCache` IDB
- Top 8 VAP composite assets → Cache API (`warmupSelectedVapUrls`)
- Top 12 SVGA URLs → Cache API (HEAD prime + body fetch with `cache: 'force-cache'`)
- Active user profile + balance snapshot
Network-aware: 2G/`saveData` হলে skip। App.tsx-এ একবার mount-এ trigger।

**5.2 SVGA decode cache (`src/utils/svgaCache.ts`)**
SVGA parser-এর parsed `videoItem` LRU cache (max 12, ~25 MB)। `SVGAPlayer`-কে patch করে cache থাকলে reparse না করে instant `setVideoItem` → first-frame latency ~700 ms → ~30 ms (second play onwards)। URL key, version-aware।

**5.3 VAP decoder warm-pool**
`useVapPlayer` / `VapPlayer` — first play-এ MediaCodec init করে ~400-800 ms লাগে। Top 4 VAP-এর জন্য GL context + parsed config pre-bind করে background-এ রাখবো (panel open trigger)। `decoderReady` flag মেইনটেইন করে tap-এ wait skip।

---

# Phase 6 — Trigger → Frame fast path

**6.1 Optimistic dispatch (`giftServiceClient.ts`)**
Gift send-এ already optimistic, কিন্তু animation queue server ack-এর জন্য wait করে। Local user-এর নিজের gift-এ:
- Local `gift_sent` event সাথে সাথে animation pipeline-এ push (idempotency key দিয়ে dedupe), server confirm আসলে metadata reconcile। Failure-এ reverse animation।

**6.2 Realtime channel hot path**
`useRoomGiftEvents` / `useChatGiftEvents` — channel subscribe হয় room enter-এর পরে। আমরা app-mount-এ `gift_global` realtime channel hot রাখবো (lightweight presence), room change-এ filter switch হবে — reconnect handshake বাঁচবে (1-2 sec)।

**6.3 Single animation host (`GlobalAnimationHost.tsx`)**
এখন live/party/chat আলাদা mount/unmount করে — context switch-এ player remount → black flash। Root-এ একটাই persistent host (z-index above stream surface) — surface-গুলো শুধু priority queue-তে push করবে। Camera surface-এর pattern same।

---

# Phase 7 — Section instant-paint

**7.1 Profile details**
`Profile.tsx` already realtime, কিন্তু avatar/cover image cold paint করে। `SmartImage`-এর CDN thumbnail variant সব profile route-এ default করব, blur-up placeholder সহ। Visited profile snapshot localStorage (5 min TTL) — back-nav instant।

**7.2 Message section**
Chat list snapshot already cached। Open-thread cold paint বাঁচাতে:
- `Chat.tsx`-এ thread enter-এ last-20 message snapshot localStorage থেকে instant render → realtime delta apply
- Sticker / gift message-এ same `SmartGiftIcon` + decode cache

**7.3 Live / Party / Private call enter**
Already PersistentCameraSurface + prejoin preview আছে। যোগ:
- Room snapshot (host info + viewer count) cache — list থেকে enter-এ instant header
- Gift panel state অন্য room থেকে carry (already memo, কিন্তু prefetch flush হয়) — IDB cache room-agnostic, ফলে cross-room instant

---

# Technical details (dev-facing)

| File | Change |
|---|---|
| `src/utils/bootWarmup.ts` | NEW — idle-callback warmup orchestrator |
| `src/utils/svgaCache.ts` | NEW — parsed `VideoEntity` LRU |
| `src/components/common/SVGAPlayer.tsx` | Use svgaCache, skip reparse |
| `src/components/common/VapPlayer.tsx` (or `UniversalAnimationPlayer`) | decoderReady flag + warm-pool hook |
| `src/components/common/GlobalAnimationHost.tsx` | NEW — single mount, priority queue |
| `src/providers/CallProvider.tsx` | Mount GlobalAnimationHost alongside PersistentCameraSurface |
| `src/utils/giftServiceClient.ts` | Local optimistic animation push |
| `src/hooks/useRoomGiftEvents.ts` | Hot-channel reuse |
| `src/pages/Chat.tsx` | Thread snapshot localStorage hydrate |
| `src/pages/Profile.tsx` | Profile snapshot localStorage hydrate + SmartImage |
| `src/App.tsx` | bootWarmup trigger (post-auth, idle) |

কোনো DB migration লাগবে না, কোনো edge function বদলাবে না — পুরোটাই client-side performance। Design untouched (memory rule)। English-only strings।

---

# Verification
- Owner account (smdollarex923@gmail.com) দিয়ে preview-তে: gift tap → first-frame timing console-log, second-play timing
- Playwright run — chat open, profile open, gift panel open paint timing
- Network throttle 4G simulation — warmup-এর পরে second tap zero network

---

# Phase 8 — App-wide instant taps + instant page commit (2026-06-26)

Research / professional standard:
- Google/web.dev INP guidance: a responsive app must minimize input delay, avoid long main-thread tasks during interaction, and paint the next visual response quickly — https://web.dev/articles/optimize-inp and https://web.dev/articles/optimize-input-delay
- web.dev bfcache guidance confirms instant navigation comes from keeping surfaces/state ready and avoiding work that blocks navigation — https://web.dev/articles/bfcache
- For Chamet/Bigo/TikTok-style mobile UX, tap must commit immediately; chunk/data warmup can start on pointer-down, but it must never block the actual click/navigation.

Verified current gap:
- 3 navigation handlers were waiting for `warmRouteForNavigation(...).then(...)` before `navigate(...)`: BottomNavigation main tabs, BottomNavigation action menu, Profile menu. On slow Android WebView or cold chunks, that makes a button feel late.
- Multiple button styles still used `active:scale`, ripple pseudo-elements, 300ms transitions, and hover transforms. These are layout/paint work during the exact input frame.

Patch scope:
- Prefetch remains, but navigation commits immediately; warm promises run in the background only.
- Global haptic bridge stays unmounted because vibration was already rejected; no extra pointer listener for no-op haptics.
- Ripple/scale press effects are neutralized; feedback remains cheap opacity-only.

# Rollout order (one pass)
1. svgaCache + SVGAPlayer patch
2. bootWarmup + App.tsx
3. GlobalAnimationHost + CallProvider mount
4. Optimistic local gift push
5. Profile/Chat snapshot hydrate
6. Verify with owner account

---

# Phase 9 — Auth black-flash + login CTA INP fix (2026-06-26)

Research / professional standard:
- Google/web.dev INP: responsive UI must minimize input delay and avoid long main-thread work before the next paint — https://web.dev/articles/optimize-inp and https://web.dev/articles/optimize-input-delay
- Android dialog guidance: dialogs are transient surfaces for input/decisions; they should not feel like a full-screen blocking route change — https://developer.android.com/develop/ui/views/components/dialogs
- Chamet/Bigo/TikTok-style native login pattern: tap commits the next surface instantly; auth/session/device checks run behind visible progress, never before first visual response.

Verified current gap:
- `Auth.handleStartClick` waited for Supabase session lookup, persistent device id, `recover_session_by_device`, edge-function session exchange, and profile readiness before opening registration. On slow WebView this made Start feel dead.
- Auth dialogs used a dark Radix overlay (`bg-slate-900/50 backdrop-blur`) plus zoom/fade animation, producing the user-visible black flash over the login background.
- Auth CTAs still carried 300ms transition + active scale, which costs paint/compositor work on the same tap frame.

Patch scope:
- Start now opens the gender/name sheet immediately; device/session recovery continues in the background and navigates only if a valid session is recovered.
- Phone OTP now commits to the OTP sheet immediately while WhatsApp send/abuse checks run in the background.
- Auth route gets a scoped native modal style: near-transparent overlay, no backdrop blur/zoom animation, opacity-only tap feedback.
- `/auth`, `/reset-password`, and OAuth callback routes are now classified as public boot surfaces so LiveKit token pre-mint / connection-pool warmup cannot create a login-screen network storm.
