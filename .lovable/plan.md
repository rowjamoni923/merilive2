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

# Admin User System contrast hardening (2026-06-28)

Research / professional standard:
- Ant Design contrast guidance: dashboard controls must separate foreground/background clearly and avoid low-contrast inactive states — https://ant-design.antgroup.com/docs/spec/contrast
- Ant Design Segmented/Tabs patterns keep active state visually double-coded through filled surface + text contrast — https://ant.design/components/segmented/ and https://ant.design/components/tabs/
- Material tabs accessibility guidance: selected/inactive tab states must remain perceivable with clear text contrast and state indication — https://m3.material.io/components/tabs/guidelines

Verified current gap:
- User System pages were globally re-skinned to light surfaces, but many old dark-theme classes remained (`bg-slate-900`, `bg-slate-800`, `text-slate-200`, `text-white`).
- On User Hub / User Management tab bars, inactive filter pills became dark pills with dark text, making labels almost invisible.
- Same risk existed across User System pages: Host Applications, All Users, All Hosts, Host Search, Block List, Live Bans, Permanent Ban, Face Violations, User Reports, Online Users, Country Distribution.

Patch scope:
- Add a single `.admin-pro-shell` CSS safety layer for high-contrast tabs, segmented filters, select triggers, action buttons, badges, and tables.
- Use semantic admin CSS variables in HSL form inside `index.css`; no component-level custom color expansion.
- Keep business logic untouched.

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

# Phase 14 — Face verification auto approve/reject integrity (2026-06-27)

Research / professional standard:
- Chamet host face verification requires the host to complete live face verification before withdrawal/access; failure patterns include multi-account detection and liveness problems — https://chametagency.id/how-to-complete-chamet-live-face-verification/ and https://news.bittopup.com/news/chamet-face-verification-failed-complete-fix-guide-2026
- BIGO host verification is identity/admin-review based; submitted media is visible only to admins for review — https://peakentertainmentph.com/how-to-upload-my-id-for-host-verification-in-bigo/
- AWS Rekognition recommends using liveness/face quality thresholds and choosing confidence thresholds based on risk tolerance; incomplete/low-quality evidence must not be silently approved — https://docs.aws.amazon.com/rekognition/latest/dg/recommendations-liveness.html

Verified current gap:
- `face_verification_submissions` has no physical `upload_pending` column; upload state lives in `ai_analysis.upload_pending`. Recent rows prove two blank orphan rows were correctly marked, but one row was later `approved` while `ai_analysis.upload_pending=true` and all media columns were NULL.
- Root cause: `sync_face_submission_from_profile_status()` blindly converts every pending submission to `approved` whenever `profiles.is_face_verified=true` or `face_verification_status in ('approved','verified')`, even if the submission is still upload-pending and has no photo/video/live-test URLs.
- Secondary gap: `face-verification-analyze` still has an outdated `gender_mismatch` hard auto-reject path even though the owner-approved DB finalizer removed gender mismatch as a reject/hold reason.
- Trigger/RPC auto-analysis depends on completed upload URLs; blank rows cannot be reconstructed after the browser upload is killed, so the professional behavior is to require resubmission, not fake approval.

Patch scope:
- Add DB guard so pending submissions cannot become approved unless uploads are complete and at least one real evidence URL exists.
- Narrow profile→submission sync so it never approves upload-pending/blank submissions.
- Keep hard auto-reject only for duplicate face / banned identity. Photo-video-live mismatch remains `needs_retry`; missing/unreadable evidence remains manual/resubmit.
- Preserve admin media visibility by forcing URL persistence before analyzer and by preventing blank approved rows.

---

# Phase 16 — Face verification under-review auto-finalize unblock (2026-06-27)

Research / professional standard:
- AWS Rekognition Face Liveness guidance says users must capture in good lighting and apps should select confidence thresholds based on risk; unreadable/blank evidence should become a retry, not stay pending forever — https://docs.aws.amazon.com/rekognition/latest/dg/recommendations-liveness.html
- AWS Rekognition Face Liveness verifies the user is physically present and detects spoof attacks from a short video selfie with prompts — https://docs.aws.amazon.com/rekognition/latest/dg/face-liveness.html
- Professional live/social/KYC flows finalize every submission into one of three visible states: approved, rejected for hard fraud/account mismatch, or retry for unreadable/missing evidence. They do not leave a new user indefinitely under review after media is uploaded.

Verified current gap:
- `pg_net` background calls to `face-verification-analyze` were returning 401 before reaching function logs because the DB enqueue request did not include a Bearer Authorization header and the function config had no explicit `verify_jwt=false` entry.
- One current `under_review` row has `upload_pending=true` and no media URLs. That cannot be auto-approved or analyzed; it must be converted to a clear retry so the user is not stuck.
- Rows with media and `upload_pending=false` need immediate re-enqueue; rows without media need immediate retry notification.

Patch scope:
- Mark `face-verification-analyze` as an internal-auth edge function (`verify_jwt=false`) while preserving in-code JWT/cron-secret validation.
- Harden `_enqueue_face_analyze` to include both `apikey` and `Authorization: Bearer <anon>` plus `x-cron-secret`, so DB-triggered analysis reaches the function reliably.
- Upgrade stuck-submission healing: media-complete rows are re-analyzed; blank/upload-pending rows become `needs_retry` with English in-app notification instead of staying under review.

---

# Phase 14 — Random-call 402 no-blank-screen fix (2026-06-26)

Research / professional standard:
- web.dev INP guidance: user interactions must get fast visual feedback and should not be blocked by long tasks or unresolved network/error work — https://web.dev/articles/optimize-inp and https://web.dev/articles/optimize-input-delay
- React guidance: unnecessary effect dependencies can make effects run too often or create infinite loops; effects should only depend on stable reactive values they actually need — https://react.dev/learn/removing-effect-dependencies and https://react.dev/reference/react/useEffect
- Chamet/Bigo-style paid call UX expectation: insufficient balance is a recoverable wallet state, not a crash state; the caller should remain on the real call-prep surface with a recharge action.

Verified current gap:
- `random-call-enqueue` correctly returns `402 { error: "insufficient_coins", required, balance }`, but the client still had fallback paths that could promote it into the generic error surface.
- `PostCallRatingSheet` depended on the inline `onClose` function from `MatchCall`; each render changed the dependency, the effect called `setStars(0)` / `setTags([])` while closed, and React reported Maximum update depth, producing the blank screen.

Patch scope:
- Add shared edge-function payload extraction that handles cloned `Response`, consumed body fallback, and JSON embedded in error messages.
- Treat `insufficient_coins` in both the invoke branch and catch branch as a recoverable wallet state: stop timers, show Recharge toast, and return to prep.
- Stabilize the rating-sheet auto-dismiss effect with an `onCloseRef` and remove the changing callback from dependencies.

---

# Phase 15 — Random-call balance authority fix (2026-06-26)

Research / professional standard:
- Chamet diamond guides document that premium matching/video calls are gated by diamond balance and top-up is the recovery path, not a generic crash/error flow — https://buffget.com/news/chamet-diamonds-guide-vip-call-costs-and-cheap-top-up
- Bigo/TikTok-style wallet UX keeps failed paid actions as wallet conversion moments: show the required balance/current balance and route users to recharge immediately.
- Supabase PostgREST rejects selects that include nonexistent columns; edge functions must select only deployed columns or the data object becomes null and downstream balance checks can falsely read 0.

Verified current gap:
- Deployed `profiles` has `coins`, `diamonds`, `user_level`, `host_level`, `vip_tier`, and `current_vip_tier_id`, but does not have `level` or `is_vip`.
- `random-call-enqueue` selected `level,is_vip`; that select fails, `profile` becomes null, and the server returns `402 { balance: 0 }` even when the user has diamonds in `coins`.
- `MatchCall` selected `is_vip`; that client profile read also fails and the prep UI shows 0 balance.
- UI precheck used only 1 minute of rate while the server requires the admin-configured preauth hold (`host_max_rate_coins_per_min * preauth_minutes_hold`, currently 500 * 2 = 1000).
- Admin Support “Add Diamonds” was sending `_field: "diamonds"` to the balance RPC, while the paid-call/gift/game wallet uses `profiles.coins` as the spendable diamond balance.

Patch scope:
- Read only valid balance/VIP/level columns and compute `effectiveBalance = max(coins, diamonds)` for the gate shown to users.
- Keep the admin-configured preauth hold as the required amount everywhere; no hardcoded call price fallback beyond already-loaded admin settings.
- If balance is missing/low, route directly to `/recharge` from both client precheck and edge-function 402 handling, while preserving the real random-call prep surface.
- Admin Support diamond add/remove now adjusts `coins`, so future manual support credits are immediately spendable in random calls.

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

---

# Phase 17 — Contact sharing role gate hardening (2026-06-26)

Research / professional standard:
- Chamet/Bigo/Poppo-style live apps restrict verified hosts from sharing phone/WhatsApp because it bypasses paid calls/gifts, while official agencies/top-up helpers need contact/payment numbers for local recharge support.
- Practical rule translated to our LiveKit + Supabase app: gate by sender role only. Recipient being a host must not block a user/agency message.

Verified current gap:
- Text chat was mostly sender-gated, but image/media contact filename checks still blocked when the recipient was a host, so agency→user/agency and support-style flows could be blocked incorrectly.
- Private-call audio detection could attribute the current user's spoken number to the remote host when the current user was not host.
- The DB `process_contact_violation` RPC accepted any caller path and did not explicitly skip agency/helper support roles before deductions/logs.

Patch scope:
- Direct chat, group chat, live chat, and party-room chat now use the same `isContactRestrictedHost` client helper: `is_host === true` and not an agency owner.
- Image/contact OCR runs only when the sender is a restricted host, never because the recipient is a host.
- Edge functions `detect-phone-number`, `scan-image-contact`, and `admin-phone-alert` skip agency owners and verified top-up helpers.
- `process_contact_violation` now returns a safe skipped result for non-hosts, agency owners, and verified top-up helpers; only real verified hosts can receive deductions/bans.

---

# Phase 18 — Random-call direct top-up + real diamond wallet fix (2026-06-26)

Verified current gap:
- Random-call insufficient-balance recovery still surfaced a Sonner-style banner/action before navigation in some client/server error paths.
- Balance cache could be initialized during a signed-out/auth-transition state and report `0`, so a caller with a real spendable diamond wallet in `profiles.coins` could be blocked incorrectly.

Patch scope:
- Remove random-call insufficient-balance UI/banner behavior; low balance now redirects straight to `/recharge` with no toast/action banner.
- Force random-call prechecks to fetch the authoritative spendable diamond wallet (`max(profiles.coins, profiles.diamonds)`) before starting.
- Edge random-call enqueue now selects only stable wallet/VIP columns, so optional profile-level schema drift can no longer make the server return balance `0` for a real diamond wallet.
- Harden `useUserBalance` so signed-out `0` is not treated as a valid initialized logged-in balance, and stale/racing balance fetches cannot overwrite the latest real wallet.

---

# Phase 19 — Random-call verified host visibility fix (2026-06-26)

Research / professional standard:
- Chamet documents random/video-chat as a real-time host discovery flow; the caller surface must reflect hosts who can actually receive the ring, not stale room rows — https://www.ichamet.com/help/faq/how-to-start-video-chat-session
- Supabase Realtime Postgres Changes should be used for live status tables/events instead of polling-only visibility refresh — https://supabase.com/docs/guides/realtime/postgres-changes
- Chamet/Bigo-style random calls fan out to available verified hosts; the count/avatar preview and server fanout must use one shared eligibility source.

Verified current gap:
- Current DB check showed `host_match_availability` eligible count = 0, while `profiles` had 1 approved, face-verified online host with fresh `last_seen_at`.
- `live_streams` had no truly active rows (`is_active=true` + no `ended_at`), and stale rows still had `status='active'`, so UI sources based on room rows could show either 0 or stale hosts.
- `MatchCall` count and `PreMatchPrep` avatar orbit were not using the same source as `random-call-enqueue` fanout, so the screen could show 0 hosts even when a verified host was online.

Patch scope:
- `get_online_global_hosts` now reads approved, face-verified, currently online hosts directly from `profiles`, with suppression/cooldown/availability guards applied when present.
- `get_random_pool_sample` now uses the same verified-online host pool for orbit avatars instead of random-call queue/availability-only rows.
- `MatchCall` count now calls `get_online_global_hosts`, and listens to `profiles`, `host_match_availability`, `host_match_stats`, and `live_streams` realtime changes with a 10s safety refresh.
- `PreMatchPrep` orbit avatars now call `get_random_pool_sample`, keeping avatar preview and count aligned with the actual fanout pool.

---

# Phase 20 — Admin mobile scroll unlock (2026-06-26)

Research / professional standard:
- MDN overscroll guidance: nested scroll areas must not trap parent scrolling at their boundary; scroll chaining should be controlled deliberately, not by blanket `preventDefault` — https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_overscroll_behavior
- web.dev viewport-unit guidance: mobile screens need dynamic viewport handling (`dvh`/natural flow) because fixed `100vh` layouts can fight browser/WebView UI and break scrolling — https://web.dev/blog/viewport-units
- Professional mobile admin/backoffice pattern for live apps: desktop can use an internal pane scroller, but mobile/tablet should prefer natural document scroll so long forms/tables remain reachable with normal pan gestures.

Verified current gap:
- `AdminLayout` correctly switched mobile/tablet CSS to natural body scroll, but the old admin table touch bridge still ran on mobile.
- When a finger started over a table/`overflow-auto`/Radix scroll area, that bridge called `preventDefault()` and tried to move the old internal `<main>` scroller; on mobile that `<main>` is intentionally `overflow: visible`, so body scrolling was blocked.
- Admin mount cleared only `overflow:hidden`; leaked modal/camera scroll locks can also leave `position: fixed`, `top`, `width`, `touch-action`, or `data-scroll-locked` on body/html.

Patch scope:
- Limit the admin scroll bridge to desktop/internal-scroll mode only; mobile/tablet touch gestures are never intercepted, so the document scrolls naturally across every admin page.

---

# Phase 21 — Profile media expired-session upload fix (2026-06-27)

Research / professional standard:
- Supabase Auth sessions include expiring JWT access tokens and refresh tokens; protected calls must refresh/restore the session before using Auth-dependent APIs — https://supabase.com/docs/reference/javascript/auth-refreshsession
- Supabase Storage access control is enforced through Storage RLS and `auth.uid()` folder checks; an expired/missing token makes owner uploads arrive as unauthenticated/forbidden — https://supabase.com/docs/guides/storage/security/access-control
- Native/social media upload UX should silently refresh credentials and retry the exact failed upload once; only true unrecoverable auth loss should ask the user to sign in again.

Verified current gap:
- User screenshot shows `Upload failed: Your session expired. Please sign in again and retry.` on Profile avatar upload.
- `EditProfile.handleCropComplete` refreshed once but kept the stale session if refresh failed, so the retry still used an expired JWT and hit Storage RLS again.
- `MyPoster` and reusable `AvatarUpload` uploaded directly without a fresh-session gate, so photo/video/poster uploads could fail after long WebView/preview sessions even while the profile screen still had cached user data.

Patch scope:
- Add one shared session recovery helper: fresh JWT check, forced refresh, native-session restore, then device-token recovery through the existing secure device-session flow.
- Harden the global auth request guard so `getSession()` never serves cached/60-minute-stale expired JWTs to Storage/RLS requests.
- Use the authenticated `session.user.id` folder for avatar/poster paths so Storage RLS and database owner rows stay aligned.
- Retry avatar/poster Storage and profile/poster DB writes once after forced recovery; if recovery is impossible, show the existing English sign-in message.
- Mark both `body` and `html` as admin-active while mounted and clear leaked inline scroll-lock styles/attributes from body/html.
- Strengthen admin mobile CSS so `.admin-shell`, root wrappers, and admin content stay in normal document flow with `touch-action: pan-y` and momentum scrolling.

---

# Phase 21 — Verified OTP sender-domain activation fix (2026-06-27)

Research / professional standard:
- Mailgun domain setup guidance confirms that a sender domain must be verified before sending and that sender verification errors happen when the sender identity does not match the verified DNS/provider domain — https://help.mailgun.com/hc/en-us/articles/32884700912923-Domain-Verification-Setup-Guide and https://help.mailgun.com/hc/en-us/articles/360011804533-Why-did-I-receive-the-error-Sender-Verify-Failed-or-some-variation-thereof
- Lovable Emails resolves the exact delegated sender subdomain; a verified workspace domain still fails if deployed functions send with an old `sender_domain`.

Verified current gap:
- Project email domain is verified for `otp.merilive.top`; delegated sender is `notify.otp.merilive.top`.
- Recent OTP logs still returned `EMAIL_SENDER_DOMAIN_NOT_READY`.
- The deployed email functions needed to use the verified sender domain exactly and be redeployed after the domain switch.

Patch scope:
- Align app OTP/app-email and auth-email sender config to `notify.otp.merilive.top` with visible From domain `otp.merilive.top`.
- Redeploy affected email functions and validate `send-email-otp` against the verified sender.

---

# Phase 22 — OTP activation-state runtime hardening (2026-06-27)

Research / professional standard:
- Mailgun/Lovable-style sender domains can be DNS-verified while project-level sending is still activating; sender calls may temporarily return provider `domain_not_verified` until activation completes.
- OTP flows in native social apps must never blank/crash on delivery setup failures; expected provider setup states should return a controlled business response and let the UI show an English retry message.

Verified current gap:
- `notify.mail.merilive.top` DNS is verified, but project email setup still reports “Setting up — Setting up emails for your project”.
- Recent `send-transactional-email` logs show provider `domain_not_verified`, which `send-email-otp` propagated as HTTP 503.
- Supabase surfaced that 503 as `Edge function returned 503` / runtime error, causing a blank-screen report instead of a normal OTP error message.

Patch scope:
- Keep sender domain as `notify.mail.merilive.top` / visible From domain `mail.merilive.top`.
- Convert temporary sender activation errors from `send-email-otp` into a normal `{ success:false, code }` response so UI handles it without a runtime crash.
- Actual OTP delivery will start automatically once Cloud → Emails finishes project activation.
