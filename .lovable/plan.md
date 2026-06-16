## 5 Critical Issues — Deep Audit & Fix Plan

প্রতিটা issue research-first rule অনুযায়ী আগে audit করব (industry standard + আমাদের current code gap), তারপর fix। এক issue এক pass — যাতে কোনোটা half-baked না থাকে।

---

### Issue 1: App overall slowness (internet থাকা সত্ত্বেও)

**Suspected root causes to audit:**
- Cold-start chunk storm (route prefetch firing too early on low-end Android)
- Realtime channel duplication / leaked subscriptions
- Excessive re-renders from CallProvider / AdminRealtime
- Image cache SW missing or thrashing
- LiveKit warmup blocking main thread

**Audit deliverable:** Chrome trace + bundle analysis + realtime channel count report. Then targeted fix (lazy chunks, debounce, memoization).

**Live-room warning overlap fix (2026-06-16):** Verified root cause was not the admin message component itself; the live/party chat stack was anchored with a fixed `72px` bottom offset while the real composer + action button row is ~96–104px plus safe-area/keyboard inset. Result: the permanent admin warning sat visually on top of the lower buttons instead of above the chat/input area. Professional live-stream pattern (Bigo/Chamet/Poppo-style chat stack; refs: LiveKit data-channel UI guidance https://docs.livekit.io/transport/data/ and Stream keyboard/safe-area guidance https://getstream.io/chat/docs/sdk/react-native/guides/keyboard/) is: bottom controls fixed, chat+warning stack offset by full composer/action-row height + `env(safe-area-inset-bottom)` + keyboard inset. Applied to both LiveStream and UnifiedPartyRoom so live + party rooms share the corrected safe-area gap.

**Immediate hardening pass (2026-06-16):** User reported fixes still not visible. Re-checked live signals: browser console still showed old AgencyDashboard chunk crashing on `profile.display_name`, session replay showed heavy module preload storm after route entry, and `supabase--slow_queries` showed production DB storm numbers: `profiles.equipped_entry_name_bar_id` updates **1,959,408 calls / 9,161,007 ms total**, entrance updates **152,822 calls / 587,477 ms total**, `swift_pay_topups.last_polled_at` updates **1,455,350 calls / 382,024 ms total**. Applied hard fixes: removed all global route chunk preloading from `App.tsx` so mobile/web no longer downloads background pages during active use; changed route Suspense fallback from `null` to themed loader to prevent white/blank route screens; throttled level auto-equip from 5 minutes to persisted once-per-day and coalesced admin/realtime bursts; changed `swift-pay-poll-deposits` from 25s per-row poll writes to 120s batch `last_polled_at` updates and deployed the function. Verified with owner account in real browser: `/agency-dashboard` loads successfully, no `display_name` TypeError. Professional references used: LiveKit data packets are for low-latency realtime in-room signaling (https://docs.livekit.io/transport/data/packets/); web.dev prefetch guidance says prefetch only likely future navigations, because it consumes bandwidth/CPU ahead of user need (https://web.dev/articles/link-prefetch); Stream keyboard guide recommends chat layouts account for keyboard/footer/safe-area instead of fixed overlaps (https://getstream.io/chat/docs/sdk/react-native/guides/keyboard/).

**App-wide lag + warning final pass (2026-06-16):** Re-ran slow-query signal and found the biggest current app-wide cause was still client fanout, not user internet: the global React Query sync bridge subscribed through `useUniversalRealtime` to 100+ publication tables, and several normal user pages opened broad `profiles` subscriptions. Because the shared bridge does not filter per user/host row, every profile/asset/admin change could wake every logged-in phone, causing render/cache invalidation storms. Fix: `useRealtimeQuerySync` is now event-based only (`app-sync`, `admin-table-update`, `notifications:change`) while screen-local hooks own scoped tables; removed broad `profiles` listeners from Home, LiveStreamFeed, FollowingList, ProfileDetail, Shop, Tasks, and FaceVerification; kept LiveKit/Supabase Realtime architecture intact and did not add polling. Also made LiveStream/UnifiedPartyRoom warning offset measure the actual bottom composer/action-row height via `ResizeObserver` instead of fixed pixels, so the admin warning stays attached to the chat stack above the input/buttons across small Android screens, keyboard, and safe area. Deployed `swift-pay-poll-deposits` after preserving batch `last_polled_at` touches. Verification signals: code search now shows no normal user-page `profiles` broad subscription matches; edge function deploy succeeded; stale fixed-offset constants are fallback-only. Professional references remain LiveKit data packets for in-room signaling (https://docs.livekit.io/transport/data/packets/), Supabase Realtime channel cleanup/scoped subscriptions (https://supabase.com/docs/guides/realtime/postgres-changes), and Stream keyboard/safe-area layout guidance (https://getstream.io/chat/docs/sdk/react-native/guides/keyboard/).

**Audit follow-up hardening (2026-06-16):** Background audit found additional safe hot spots: a 300ms live-join cleanup interval, per-`stream_viewers` exact count query, uncached `RoomWelcomeBanner` DB query on every room mount, `AnimatePresence mode="sync"` on chat rows, and a 1200ms artificial admin route loading delay. Fixed without changing design: live join notifications now expire via per-notification timeout; viewer-count realtime updates mutate the in-memory viewer set instead of running a count query on every event; admin warning messages are cached for 5 minutes and slide in from above; chat overlay caps DOM rows to 40 and uses `popLayout`; admin fallback delay removed. Kept the scoped `stream_chat` safety-net channel because it is filtered by `stream_id` and guarantees public chat delivery when LiveKit DataPacket misses.

**No-excuses app-wide speed pass (2026-06-16):** User confirmed problems still felt unresolved. Re-checked live console/edge/DB signals before editing: browser logs still showed notification subscribe → unsubscribe → subscribe churn within seconds, `detect-vpn` edge calls failing after boot, `swift-pay-poll-deposits` still taking ~9.5s in recent edge logs, and `supabase--slow_queries` still ranked auto-equip profile writes as the biggest historical production storm (`equipped_entry_name_bar_id` **1,959,408 calls / 9,161,007 ms**, entrance fields **152,824 calls / 587,505 ms**, plus `swift_pay_topups.last_polled_at` **1,455,650 calls / 382,098 ms**). Root cause: prior fixes reduced some fanout but still left (1) purchase/app-sync forced auto-equip bypassing the 24h guard, (2) multiple `useNotifications()` mounts opening duplicate user notification channels, (3) boot-time image cache warmup doing 20+ Supabase queries and up to 500 image warms, (4) boot-time gift metadata + animation warmup, and (5) React Query persistence writing a huge app cache to `localStorage`. Fix applied without UI/design changes: forced auto-equip now has a 10-minute hard guard and 10s coalescing; notifications realtime is singleton per user so CallProvider owns the only always-on channel; boot only registers the SW and no longer warms remote images/gifts; gift admin updates clear cache without refetching in background; persisted React Query cache now keeps only tiny critical keys for 6h and writes less often. Professional refs: Supabase Realtime docs recommend channels for specific realtime features and presence/broadcast rather than broad duplicate subscriptions (https://supabase.com/docs/guides/realtime); web.dev prefetch guidance says prefetch consumes bandwidth/CPU and should be limited to likely next navigations (https://web.dev/articles/link-prefetch); LiveKit data packets remain the pro in-room low-latency path for room events while Supabase Realtime stays for app/DB sync (https://docs.livekit.io/transport/data/packets/).

**Background audit completion pass (2026-06-16):** Incorporated the completed research/code-audit agents. Additional verified fixes: `detect-country` now uses a 30-minute session singleton cache shared by Auth, Settings, and geolocation login/registration paths, preventing 3–5 edge invocations per session; `useRealtimeQuerySync` no longer clears REST caches before every realtime debounce and only clears for REST-cache-affecting admin/config tables; `useAdminBroadcastSync` no longer double-invalidates React Query directly and now lets the single debounced bridge handle it; admin broadcast kill-switch check is cached in localStorage for 1h so realtime channel open is not serialized behind a DB read on every cold start; `LiveTasksCard` replaced 30s per-viewer room polling with event-driven refresh plus 5-minute safety net; `App` no longer returns bare `null` while session restore is loading, preventing white/blank native cold-start frames. Research standards: Supabase Realtime docs recommend scoped channels and avoiding duplicate subscriptions; pro live apps use event-driven task/progress refresh and boot only essential auth/realtime, with heavy media loaded on demand.

---

### Issue 2: Inbox photo not showing instantly

**Suspected root causes:**
- Optimistic UI missing — waits for Supabase Storage upload + signed URL before render
- No local blob preview while uploading
- Realtime INSERT event arriving before image URL is ready
- `MediaUploader.tsx` / `UnifiedChatMessage.tsx` not using `URL.createObjectURL` for instant preview

**Fix pattern (industry std — WhatsApp/Telegram):** Show local blob immediately, upload in background, swap URL on success, show retry on fail.

---

### Issue 3: Call screen goes white during ringing (Android APK)

**Suspected root causes:**
- `IncomingCallActivity` / call UI route lazy chunk not preloaded → WebView blanks while fetching
- FLAG_SECURE + WebView transparency conflict
- LiveKit prejoin renderer attached before DOM mounted
- Cold-start capture redirecting before call route hydrates

**Audit:** logcat from APK + React route mount timing. Likely fix: preload `/call` chunk on FCM receive, keep solid background until first frame.

---

### Issue 4: Agency Dashboard error on entry

**Need:** exact error message/stack. Will reproduce with owner test account (smdollarex923@gmail.com) in preview, capture console, then fix.

Common patterns: missing RLS grant, null agency_id, hook order violation, type mismatch in `AgencyDashboard.tsx`.

**Verified root cause (2026-06-16):** dashboard relational joins can legally return `null` profile rows for deleted/missing users, but render paths still read `profile.display_name` / `owner_profile.display_name` directly. That matches the screenshot stack: `Cannot read properties of null (reading 'display_name')` in `AgencyDashboard`. Professional pattern is tombstone/fallback rendering for missing users rather than crashing the whole admin/agency surface (example pattern: render “deleted/missing user” fallback instead of raw null profile data; see React missing-user handling discussion: StackOverflow result `How to gracefully handle missing user data in React...`, 2024-11-19).

**Fix applied:** centralized nullable profile helpers (`getProfileName`, `getProfileInitial`, `getProfileAvatar`) and replaced unsafe avatar/name reads in pending hosts, parent agency owner, top hosts, sub-agents, and parent contact modal.

---

### Issue 5: Agency creation OTP not arriving (in-app notification + Gmail)

**Two channels broken:**
- **In-app OTP notification:** FCM push payload missing or topic not subscribed for agency-otp event
- **Gmail OTP:** Was "default" but Lovable Emails domain status unknown — need to check `email_domain--check_email_domain_status` first

**Fix order:** verify email domain → fix edge function `send-agency-otp` (or equivalent) → fix in-app notification trigger → test end-to-end with owner account.

---

## Execution Order (one focused pass per issue)

1. **Issue 4 first** (agency dashboard error) — fastest, blocks agency testing for issues 5
2. **Issue 5** (OTP) — needed for new agency signups
3. **Issue 3** (call white screen) — APK-critical, needs rebuild anyway
4. **Issue 2** (inbox photo) — UX critical
5. **Issue 1** (overall slowness) — largest scope, needs profiling data, done last

**Each pass = research → audit current code → identify gap → fix → owner-account verify (where possible in Lovable preview) → mark APK-rebuild items honestly.**

**Design SACRED** — only business logic/functionality touched, zero UI changes.

---

### What I need from you to start

1. **Issue 4 exact error text** — open Agency Dashboard, screenshot or paste the red error. (Or I can reproduce with owner account — just confirm I should.)
2. **Issue 3** — call white screen: happens on caller side or callee side? Both?
3. Approve plan → I start with Issue 4 immediately.