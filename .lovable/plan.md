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

---

# Phase 10 — Global 400-page instant response pass (2026-06-26)

Research / professional standard:
- Native live/social apps keep tap handlers under one frame: visual state changes immediately; prefetch/realtime/maintenance work runs after paint or on realtime events.
- React 18 transitions are useful for non-urgent updates, but primary tab/page commits in a mobile app must not be deferred behind background rendering.

Verified current gap:
- `RouteScopedBackgroundHooks` reset `backgroundReady` and remounted heavy hooks on every pathname change, so every page navigation could restart non-visual services.
- Bottom navigation used `startTransition` around primary `navigate(...)`, delaying the route commit on busy WebViews.
- Global `<Button>` had a guarded click wrapper and timer, adding overhead to every button press.
- `useExpiredItemsRestorer` ran immediately and every minute from Profile/VIP, repeatedly hitting DB and logging in the foreground.
- Presence heartbeat/logging woke every 30s and matched the user's console spam during lag reports.

Patch scope:
- Keep background hooks mounted once after first app surface; route change no longer resets them.
- Route-change video lifecycle pause is idle-deferred so it cannot block navigation paint.
- Bottom tabs/action menu navigate synchronously; route warming remains background-only.
- Global button guard removed; CSS `touch-action: manipulation` enforced for tappables.
- Expired item restore changed to one idle maintenance pass per user / 6h, no minute polling.
- Presence heartbeat relaxed to 120s and logs gated to dev-only.
- React Router `v7_startTransition` future flag removed so primary route commits are not transition-deferred.
- Bottom nav active pill changed from shared-layout spring animation to static instant paint; no haptic/no-op bridge calls on tab/action taps.
- React Query localStorage persistence throttle raised to 120s native / 60s web to reduce synchronous storage jank during navigation.

---

# Phase 11 — Remove remaining global boot/navigation jank (2026-06-26)

Verified current gap:
- Public/auth pages still mounted several protected-app guards/overlays and non-visual bridges before login, adding first-paint work.
- BottomNavigation mounted profile + level realtime hooks only to gate the plus menu, opening extra DB/realtime work on every main page.
- The unread badge hook ran multi-query counts immediately on mount, competing with route paint.
- Maintenance/analytics bootstrap still did foreground network work (`getUser` / app setting fetch) during app boot.
- Realtime connection-status polling and presence cleanup maintenance woke too frequently for a mobile WebView.

Patch scope:
- Gate protected overlays/guards behind authenticated non-public routes only.
- BottomNavigation no longer opens profile/level realtime channels; tab/action taps never wait on network.
- Bottom action menu uses opacity/linear 60-80ms transitions, removes blur-heavy overlay, and flattens shadows/blur on low-end devices.
- Unread badge initial count now runs on idle and is throttled for 30s.
- Analytics uses local `getSession()` instead of network `getUser()`; maintenance check runs on idle.
- Realtime polling relaxed to 30s and presence cleanup to 30min/foreground-only.
- Route-change video lifecycle scan now runs only when leaving media routes, not on every page transition.
- User balance prefetch now receives the App session userId directly, so it does not perform an extra auth-session lookup while the route is painting.

---

# Phase 12 — OTP email delivery failure hardening (2026-06-26)

Research / professional standard:
- Google Identity Platform email action guidance treats verification/reset emails as security-critical account flows that must show clear user action and avoid ambiguous failure states — https://cloud.google.com/identity-platform/docs/email
- OWASP authentication guidance requires short-lived OTPs and safe error handling that does not expose secrets or implementation details — https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- Professional live/social apps (Chamet/Bigo/TikTok-style flows) keep the OTP UI instant, but if delivery fails they return the user to the input surface with a clear, non-technical reason instead of leaving them on a code screen that can never verify.

Verified current gap:
- Latest `send-transactional-email` logs show the old `LOVABLE_API_KEY` and `no_matching_sender` issues were replaced by `domain_not_verified` at 2026-06-26T19:05–19:06 UTC, meaning code is reaching the sender but DNS/project email activation is not complete yet.
- `send-email-otp` collapsed all sender-domain failures into a generic 500, so the login toast only said “Failed to send verification email.”
- `send-signup-confirmation` returned the OTP code in an error payload when email delivery failed; this is not acceptable for a production OTP flow.

Patch scope:
- Normalize Lovable Email provider failures into safe app codes: `EMAIL_DOMAIN_NOT_VERIFIED`, `EMAIL_SENDER_DOMAIN_NOT_READY`, `EMAIL_SERVICE_AUTH_FAILED`, and `EMAIL_DELIVERY_FAILED`.
- Propagate safe codes through `sendOtpEmail` and OTP edge functions without leaking provider internals or OTP secrets.
- Auth/agency UI now maps those codes to professional English messages and returns from the OTP screen when delivery was never possible.
- Delivery still requires the configured email domain to finish activation; code cannot bypass DNS verification.

---

# Phase 13 — 400-page no-white-screen navigation pass (2026-06-26)

Research / professional standard:
- React Suspense docs: if already-visible content suspends during an urgent update, the boundary can replace it with fallback; updates marked as transitions keep the previous UI visible while the next UI prepares — https://react.dev/reference/react/Suspense and https://react.dev/reference/react/useTransition
- React Router 6.30 future flags include `v7_startTransition`, which wraps browser-router location updates in `React.startTransition` — https://reactrouter.com/6.30.3/upgrading/future
- Native/social app pattern (Chamet/Bigo/TikTok/WhatsApp-style): tap changes route state immediately, but the old committed screen remains painted until the next screen can draw; no white/black/loading interstitial.

Verified current gap:
- Root route fallback had already been changed to `null`, but `BrowserRouter` route updates were still urgent. When a lazy page chunk suspended, React could hide the entire route subtree and render the `null` fallback, exposing the app/body background as a white/blank screen.
- `RouteTransitionHost` existed but was not mounted, so route-change body tagging/transition coordination never ran for agency dashboard menu items, profile menus, profile details, reels, message, or admin routes.

Patch scope:
- Enable `<BrowserRouter future={{ v7_startTransition: true }}>` so every app/menu/admin/profile/message/reels navigation uses React transition semantics and keeps the previous real page visible while lazy chunks resolve.
- Mount `RouteTransitionHost` once inside the router so every path change shares one global transition coordinator.
- Keep all fallback UI as `null`; no spinner, skeleton, black screen, white screen, or fake loading surface is introduced.
- Removed the DOM-clone visual-hold approach. User-corrected standard: no fake snapshot/clone/loading cover; continuity must come from the actual previous React surface staying mounted by transition semantics and from persistent media surfaces.
- Added `StableRoutes`: the previous route remains the real mounted React tree while the next route mounts hidden and prepares; once real content exists, that same mounted next tree is promoted visible. No screenshot, DOM clone, spinner, or loading surface is used.

---

# Phase 14 — Agency dashboard realtime crash fix (2026-06-26)

Research / professional standard:
- Supabase Realtime Postgres Changes requires all callbacks to be registered before `.subscribe()` and uses a channel topic for the joined realtime socket — https://supabase.com/docs/guides/realtime/postgres-changes
- Chamet/Bigo-style agency dashboards should keep realtime status/earnings fresh, but route transitions must never reuse an already-subscribed socket object during hidden/visible screen handoff.

Verified current gap:
- `AgencyDashboard.tsx` used the static channel topic `agency-dashboard-realtime`. With StrictMode or StableRoutes double-mount/rapid remount, the app could hit Supabase's guard: `cannot add postgres_changes callbacks for realtime:agency-dashboard-realtime after subscribe()`.

Patch scope:
- Keep all existing realtime tables and UI unchanged.
- Add a per-mount unique suffix to the Agency Dashboard channel topic, matching the already-applied Face Verification fix pattern.
- Cleanup remains `supabase.removeChannel(channel)`; no polling, fake loading, or design change introduced.

---

# Phase 14 — Face verification CTA flow fix (2026-06-26)

Research / professional standard:
- Apple HIG and Material accessibility keep primary touch targets at 44pt / 48dp minimum; this page keeps the CTA at 56px — https://developer.apple.com/design/human-interface-guidelines/buttons and https://m3.material.io/foundations/accessible-design/accessibility-basics
- Android/Capacitor keyboard guidance favors resize/scroll-safe layouts over fixed overlays that cover inputs — https://developer.android.com/develop/ui/views/layout/sw-keyboard and https://capacitorjs.com/docs/apis/keyboard
- Native onboarding/profile setup pattern: short forms place the primary CTA in the actual form flow with 16–20px spacing after the final field; sticky/fixed footer is only acceptable if full CTA height + safe-area is reserved.

Verified current gap:
- Host face-verification Step 1 used `.sticky-cta-bar`, so the `Next` button stayed fixed inside the scrollport while the form moved behind it.
- The face-verification scroll container also added global bottom-nav padding, creating extra blank space on this fullscreen onboarding surface.

Patch scope:
- Convert face-verification CTA bars to in-flow `flow-cta-bar` so `Next`, `Back/Next`, and `Go Back` scroll naturally with the step content.
- Keep keyboard safety by using only safe-area bottom padding on this fullscreen page; no sticky overlay remains above inputs.
- Upgraded the web `PersistentCameraSurface` bridge from timer polling to an event-driven `persistentCameraSession` subscription, so live/party/private-call preview camera continuity updates instantly without reopening the camera and without visibility-refresh/polling hacks.
- Changed `PageSkeleton` into a transparent `data-route-placeholder` marker instead of painting white/gradient placeholders.
- Removed admin access and admin route permission spinners so agency/admin menu movement never paints a verification/loading interstitial.

---

# Phase 15 — Match-call header controls hardening (2026-06-26)

Research / professional standard:
- Chamet documents random/video-chat matching as a core user journey; exit/history controls on that surface must be first-class and reliable — https://www.ichamet.com/help/faq/how-to-start-video-chat-session
- Google/web.dev INP guidance: input response should be committed in the interaction frame, with cleanup/network work moved behind the visible action — https://web.dev/articles/optimize-inp

Verified current gap:
- The match prep Back control depended on browser-level history behavior, which can be unreliable inside preview/WebView shells and can make `navigate(-1)` appear to do nothing.
- Back and Call History relied only on normal `click`; if the self-camera surface or global instant-navigation layer won the touch race, the header control felt dead.

Patch scope:
- Add explicit `onBack` / `onHistory` hooks from `MatchCall` into `PreMatchPrep`.
- Header buttons now commit on pointer/touch end, stop propagation, dedupe the following click, stop the local preview stream immediately, and navigate synchronously.
- Back uses React Router history index with `/` fallback; History routes directly to `/call-history`.
- Queue/broadcast cancellation is kept, but it runs in the background so the tap is never blocked by Supabase/native cleanup.

---

# Phase 16 — Shop preview dialog centering hardening (2026-06-26)

Research / professional standard:
- Material Design dialogs are modal surfaces that must stay visually focused and centered within the viewport, with scroll contained inside the surface when content is tall — https://m3.material.io/components/dialogs/overview
- Apple HIG sheets/dialog-style surfaces keep the user’s task in focus and avoid unexpected off-screen placement; content should adapt to available viewport rather than anchor below the visible center — https://developer.apple.com/design/human-interface-guidelines/sheets
- Android dialog guidance treats dialogs as transient focused windows; large content should scroll inside the dialog instead of moving the whole dialog out of view — https://developer.android.com/develop/ui/views/components/dialogs

Verified current gap:
- The shop preview dialog still used transform-based Radix/Tailwind enter animations (`zoom`/`slide-in-from-top`) on the same element that relies on `translate(-50%, -50%)` for centering. During/after the open animation, the animation transform could override the centering transform, leaving the dialog’s top-left at viewport center — exactly the user screenshot where the preview surface appears stuck near the bottom.
- `DialogContent` also spread incoming `style` after its own keyboard/scroll styles, so Shop’s custom gradient style replaced the centering/keyboard-safe inline safeguards.

Patch scope:
- Dialog content now uses stable center positioning with no transform-based open/close animation on the centered element.
- Incoming styles are merged without replacing the core centered transform / momentum-scroll / keyboard padding safeguards.
- Shop preview modal gets a `100dvh - 32px` max-height and stable mobile width so entry/portrait previews scroll inside the modal while the modal itself remains in the visual middle.
