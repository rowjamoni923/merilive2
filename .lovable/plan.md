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

# Rollout order (one pass)
1. svgaCache + SVGAPlayer patch
2. bootWarmup + App.tsx
3. GlobalAnimationHost + CallProvider mount
4. Optimistic local gift push
5. Profile/Chat snapshot hydrate
6. Verify with owner account
