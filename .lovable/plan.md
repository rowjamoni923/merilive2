## 3-issue Plan — VAP First-Play, Gift Panel Slowness, Chat Avatars

Honest read on what is happening, what professional apps do, what I will change, and what needs an APK rebuild vs Lovable-only.

---

### Issue 1 — VAP gift animation does not play on first send (plays on second)

**Diagnosis (verified in code):**
- `VAPPlayer.tsx` mounts → `useNativeVAPAttempt` immediately runs and returns `'pending'` (line 90) → renders **nothing** for ~50-300ms while it awaits `loadRemoteFlag()` + `isNativeVAPAvailable()` + `tryNativeVAPPlay()`.
- During that `pending` window the WebView `<canvas>/<video>` never mounts. If native flag ends as `fallback`, by the time the WebView path mounts, the gift event has already advanced timers / been dismissed by the parent — so the first attempt looks like nothing happened.
- VAP layout detection (`detectVapSideBySideLayout`) on first uncached video can paint the alpha-mask half (white) for the opening frames, which the user perceives as "didn't play".
- Cache API persistent layer (`vap-binary-v1`) is correct, but `warmupVapUrls` is called for top-8 icons only (`useGiftPrefetch.ts:104`) — animation MP4s themselves are NOT warmed until a gift is sent. First send = cold network.

**Industry standard (Chamet / Bigo / Poppo via Agora-style flow):**
- Start the animation surface on `'pending'` with a transparent placeholder (not `null`), so the parent never thinks "nothing rendered".
- Pre-fetch top popular gift MP4 + JSON on app boot (idle callback), with persistent Cache API.
- Native VAP attempt has a hard 350ms budget — exceed it → fallback immediately, no infinite "pending".
- VAP layout cached by URL prefix so the SAME asset never re-detects across sessions.

**Lovable-only fixes:**
1. `useNativeVAPAttempt` — start in `'fallback'` instead of `'pending'`. Flip to `'active'` only AFTER `tryNativeVAPPlay` resolves `ok:true`. This guarantees WebView path mounts immediately and native silently takes over later when ready.
2. `VAPPlayer.tsx` — render `<canvas>` from frame 0 even during native pending; hide it the instant `nativeMode === 'active'`.
3. `useGiftPrefetch.ts` — extend warmup beyond icons: warm `animation_url` + `animation_config_url` for top 12 gifts in `warmupVapUrls(..., {priority:'low', persist:true})` so first send of popular gifts is bytes-from-disk.
4. Persist VAP layout decision keyed by URL hash in `localStorage` (currently in-memory only — lost on reload).

**Native (APK rebuild) — none required for the first-play fix.** Native plugin already correct; only JS sequencing is wrong.

---

### Issue 2 — Gift panel slow to open + slows whole app internet

**Diagnosis:**
- `GiftPanel` (873 lines) and its swipeable grid eagerly mount `<img>` for every gift icon across every category page on open. With ~100+ gifts, that's 100+ parallel HTTP requests on the same connection → saturates the WebView socket pool → live stream, chat realtime, FCM all stall.
- `useGiftPrefetch` warms only top-8 icons; the remaining 90+ kick off concurrently on panel open.
- No `<img loading="lazy">` / IntersectionObserver gating per page.

**Industry standard:**
- Gift grid is paged tabs (4-8 visible at a time). Off-tab images use `loading="lazy"` + low fetchpriority. Only currently visible tab images use eager + high fetchpriority. Concurrency capped (~6 parallel).
- Icons served as small WebP thumbnails (~80x80 q70), not full MP4 poster frames.

**Lovable-only fixes:**
1. `GiftSwipeableGrid` — add `loading="lazy"`, `decoding="async"`, `fetchpriority={isActiveTab ? 'high' : 'low'}` to icon `<img>`.
2. Add an IntersectionObserver gate so off-tab icons don't start their request until the tab nears viewport.
3. Use `enhanceThumbnail(icon_url, { width: 96, quality: 70 })` for every gift icon (icons currently raw URL).
4. Cap parallel icon fetches via a tiny image queue (max 6 concurrent on slow connection per `navigator.connection.effectiveType`).
5. Stop animation MP4 warm storm when a user opens the panel — never warm MP4s on open; only warm on hover/long-press (i.e. when user intends to send).

---

### Issue 3 — Chat list shows letters/initials, frame loads but avatar photo missing (screenshot evidence)

**Diagnosis:**
- `ChatListView.ConversationRow` renders `<AvatarWithFrame>` with `src = enhanceThumbnail(avatar_url, ...)`.
- `AvatarWithFrame` runs its own gender / placeholder pipeline (`getDisplayAvatar`, `getCachedGender`, `requestGender`) — if `gender` cache is empty for that user, the avatar `<img>` waits on a Supabase `requestGender` round-trip before deciding final src; meanwhile fallback initials render.
- `requestGender` is batched, but for 10+ rows on first chat-list load, the batch fires ONCE — every subsequent render before resolution shows initials.
- Also: thumbnail CDN URL may be returning 404 silently when the original is not in the storage bucket → `<AvatarImage>` falls through to `<AvatarFallback>` (the letter).

**Industry standard:**
- Avatar pipeline never blocks `<img>` on a secondary RPC. Real avatar URL paints first; gender-aware placeholder only used when `avatar_url` is `null`.
- Failed thumbnail → fall through to original `avatar_url`, not to initials.

**Lovable-only fixes:**
1. `AvatarWithFrame` — when `src` (avatar_url) is present, render it IMMEDIATELY without waiting for `requestGender`. Gender lookup only kicks in when `src` is null/empty.
2. Add `onError` handler that retries with original (non-thumbnail) URL before falling back to initials.
3. `ChatListView` — pass real `gender` if conversation payload includes it (extend `Conversation` shape) so the gender RPC is skipped entirely.
4. Add `preloadUserFrames` batch call for the first 20 conversations on mount so frames + avatars warm together.

---

### Execution order
1. **Issue 3 first** (smallest blast radius, immediate user-visible win in screenshot).
2. **Issue 1** (VAP first-play sequencing fix in `useNativeVAPAttempt` + warmup expansion).
3. **Issue 2** (gift panel lazy/concurrency hardening).

### Verification
- Owner account login (`smdollarex923@gmail.com / Sazzad017@`) → Chat list reload, then test gift send in live + private call + party room.
- Network panel: confirm gift panel open keeps concurrent requests ≤ 6 and total bytes on idle tab < 200 KB.
- Console: confirm `[VAPPlayer]` mounts canvas on frame 0, native takes over only when ready.

### APK rebuild needed?
**No.** All three issues are React/JS sequencing + image loading. Native VAP plugin code is untouched. Web preview = APK behavior here.
