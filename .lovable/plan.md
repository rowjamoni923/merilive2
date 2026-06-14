## Goal

Admin dashboard-এ একটা নতুন **"Company Profit Analytics"** section যোগ করব যেখানে:
- প্রতিটা revenue sector (Gift, Private Call, Agency Withdrawal Fee, Helper, Exchange, Game, Recharge, VIP/Noble/Subscription, Party Room, PK Battle, Lucky Gift, Shop) থেকে কত profit এসেছে
- **Gross revenue + Net profit side-by-side** (revenue − payouts − gateway cost)
- Date filter: **Today / Yesterday / This Week / This Month / Custom range** (calendar picker)
- প্রতিটা sector card click করলে drill-down detail
- Total app-wide profit + percentage contribution per sector

## Research (auto-run per rule)

**Competitor pattern** (Bigo Live admin, Chamet operator panel, Olamet finance dashboard): সবাই একই pattern follow করে — gross GMV → company commission % → payout cost → gateway fee → net. Granularity day/week/month/custom। Source-of-truth হিসেবে একটা central `commission_config` table থাকে যাতে সব % এক জায়গা থেকে manage হয়।

**Our current state**: Revenue calculation কোথাও centralized নেই — গিফট/কল/withdrawal fee সব আলাদা আলাদা table-এ scattered। কোনো unified analytics view নেই। `recharge_transactions`, `gift_transactions`, `private_calls`, `agency_withdrawals` (fee_percentage column already exists), `helper_orders`, `game_transactions`, `user_beans_exchanges`, `subscription_orders`, `pk_battles`, `lucky_gift_results`, `user_purchases` — সব data আছে কিন্তু aggregate করার কিছু নেই।

## Implementation Plan

### Phase 1 — Database (migration)

**Table 1: `profit_config`** (central source of truth, single row per sector)
```
sector_key TEXT PK   -- 'gift','private_call','agency_withdrawal_fee','helper_order',
                     -- 'exchange','game','recharge','vip_subscription','noble_subscription',
                     -- 'party_room','pk_battle','lucky_gift','shop_purchase'
display_name TEXT
company_cut_percent NUMERIC      -- e.g. 30 = company keeps 30%
default_payout_percent NUMERIC   -- e.g. 70 = host gets 70% (informational, real config still lives in section's own table)
gateway_cost_percent NUMERIC     -- avg payment gateway fee (e.g. 3 for recharge, 0 for internal)
is_active BOOLEAN
notes TEXT
```
Seed with all 13 sectors using current real config values (read from existing tables: `agency_withdrawals.fee_percentage`, helper level configs, etc.)

**Table 2: `profit_daily_snapshots`** (materialized for fast historical query)
```
snapshot_date DATE
sector_key TEXT
gross_revenue_coins BIGINT      -- total coin volume in sector
gross_revenue_usd NUMERIC        -- converted using currency_rates
company_cut_coins BIGINT         -- coins kept by company
company_cut_usd NUMERIC
payout_coins BIGINT              -- coins paid to hosts/agencies/helpers
gateway_cost_usd NUMERIC
net_profit_usd NUMERIC           -- company_cut_usd − gateway_cost_usd
transaction_count INT
PK(snapshot_date, sector_key)
```
RLS: admin only.

**Function: `compute_profit_for_range(start_date, end_date)`** — security definer SQL function returning per-sector aggregate. Reads live from source tables (for current day) + `profit_daily_snapshots` (for historical). Returns gross, company cut, payouts, net profit per sector.

**Cron: nightly snapshot** — pg_cron job runs at 00:05 UTC, computes previous day's totals per sector, upserts into `profit_daily_snapshots`. Idempotent.

### Phase 2 — Edge function

**`admin-profit-analytics`** (verify_jwt=false, admin check inside)
- Input: `{ start_date, end_date, granularity: 'day'|'week'|'month' }`
- Validates caller via `admin_users` + `has_role`
- Calls `compute_profit_for_range` RPC
- Returns: `{ totals: {gross_usd, company_cut_usd, payouts_usd, gateway_cost_usd, net_profit_usd}, sectors: [...], timeline: [{date, ...}] }`

### Phase 3 — Frontend

New page `src/pages/admin/AdminProfitAnalytics.tsx` + route `/admin/profit-analytics`:

- **Header**: date-range picker (Today / Yesterday / Week / Month / Custom). Custom uses shadcn DatePicker with `pointer-events-auto`.
- **Top KPI row**: Gross Revenue | Company Cut | Payouts | Gateway Cost | **Net Profit** | Profit Margin %
- **Sector grid** (13 cards): each shows gross, company %, net profit, % of total profit, sparkline. Click → expands to show transaction count + drill-down link.
- **Timeline chart**: stacked area (recharts) of net profit per sector over selected range.
- **Export CSV** button.

Add link to AdminDashboard quick-tiles + AdminLayout sidebar ("Profit Analytics").

### Phase 4 — Verify

- Owner login (smdollarex923@gmail.com), open `/admin/profit-analytics`, select Today/Week/Month, confirm numbers match a hand-spot-check from one sector (e.g. recharge_transactions sum vs displayed gross).

## Out of scope (this phase)

- Editing the per-sector % from this page (read-only from `profit_config`; separate admin section will manage it later if needed)
- Forecasting / predictions
- Per-host or per-agency drill-down (link to existing pages instead)

## Technical notes

- All UI strings English (per core rule)
- No design change to existing dashboard — additive only
- Snapshot cron makes range queries O(days) instead of O(transactions)
- Single source of truth = `profit_config`; section-specific configs (e.g. `agency_withdrawals.fee_percentage`) remain authoritative for actual transactions, `profit_config` is for analytics display + new-flow defaults
- Currency normalization via existing `currency_rates` table

Approve করলে Phase 1 migration দিয়ে শুরু করব।

---

## Camera lifecycle hotfix audit — 2026-06-13

### Research baseline

- Professional Android live streaming apps use a single native RTC/camera owner, deterministic preview/session cleanup, and explicit WebView permission gating when hybrid UI exists.
- Agora-equivalent pattern: `startPreview` / join channel uses one RTC engine and cleanup must stop preview/leave/destroy before another camera user opens.
- LiveKit-equivalent pattern: Room/LocalVideoTrack owns capture; teardown must call track stop/release and room disconnect/release, not rely on GC.
- Sources: Android CameraX lifecycle architecture (`developer.android.com/media/camera/camerax/architecture`), Agora Android live streaming best practices (`docs.agora.io/.../best-practices/api-config-before-joining-channel`), LiveKit Android SDK reference (`docs.livekit.io/reference/client-sdk-android/`).

### Verified code facts

- `CameraOwnership.STALE_OWNER_TTL_MS = 30_000ms`; `OEM_RELEASE_GRACE_MS = 650ms`.
- BUG-1 already present: `startLocalPreview` catch releases `OWNER_LIVEKIT` when `room == null`.
- BUG-2 already present: `ActiveCallScreen.handleEndCall` no longer manually calls `proCamera.release()`.
- Remaining medium bug found: normal `handleOnDestroy` released only advisory ownership via `CameraOwnership.forceRelease()` but did not call `stopLocalPreviewInternal`, so a standalone GoLive prejoin preview `previewRoom`/`previewTrack` could survive Activity destroy until GC.

### Implemented fix

- In `LiveKitPlugin.handleOnDestroy` normal teardown, call `stopLocalPreviewInternal(restoreOpaque = false)` before `detachAllRenderersInternal(releaseRenderers = true)` so prejoin preview `track.stopCapture()`, `track.stop()`, renderer release, `previewRoom.release()`, and CameraOwnership release execute through the existing safe cleanup funnel.
- Severity low advisory gap left unchanged: JS `ProCameraEngine` can briefly hit zero refs during GoLive → LiveStream router handoff, but native `CameraOwnership` remains `OWNER_LIVEKIT`; no confirmed hardware camera bug.

### Verification required

- Web reload sees React-side fix immediately.
- Kotlin fix requires Android APK rebuild, then owner/device test: open GoLive preview → destroy/recreate Activity → reopen preview; expected: no `CAMERA_IN_USE`, no blank preview.

---

## Admin campaign premium-card asset hotfix — 2026-06-13

### Research baseline

- Professional live-streaming admin campaign tools keep promotional art in CDN-backed asset libraries and never route immutable app/CDN asset URLs through private storage signing. Missing uploads should show a visual fallback, not admin storage errors.
- Competitor-equivalent pattern from Chamet/Bigo-style campaign operations: reusable promo art library + cached CDN delivery + fallback thumbnail for broken media; LiveKit is not involved for this admin asset path.
- Sources: Supabase Storage public URL/signing docs (`supabase.com/docs/guides/storage/serving/downloads`), Vite static asset handling (`vite.dev/guide/assets`), Cloudflare R2/CDN cache behavior (`developers.cloudflare.com/r2/`).

### Verified code facts

- Screenshot error points to `/__l5e/assets-v1/.../card_025.webp Object not found` while editing Recharge Campaign premium cards.
- `AdminRechargeCampaigns` renders `PREMIUM_CAMPAIGN_CARDS` through `SmartImage`.
- `SmartImage` itself preserves same-origin `/__l5e/assets-v1/...` URLs, but the global admin media auto-resolver did not classify `/__l5e/assets-v1/` as local/CDN app media.
- Because `adminStorageImages.LOCAL_APP_MEDIA_RE` missed `/__l5e/assets-v1/`, the resolver treated Lovable CDN assets as raw Supabase storage paths and tried signing phantom objects like `banners/__l5e/assets-v1/.../card_025.webp`, producing `Object not found`.

### Implemented fix

- Added `/__l5e/assets-v1/` to the local app-media allowlist in `adminStorageImages.ts` so admin auto-resolver never signs Lovable CDN assets.
- Added the same allowlist to `cdnImage.ts` for consistency across SmartImage/public-media normalization.

---

## RTC black-screen renderer audit — 2026-06-14

### Research baseline

- Professional live/call apps keep a single native RTC room/camera owner and treat renderer binding as lifecycle-idempotent: initialize renderer with the active RTC engine/room before attaching a track, never double-add the same renderer to the same track, and rebind surfaces after network/lifecycle handoffs instead of reopening camera.
- Agora-equivalent pattern: setup local/remote video canvases before/at join and keep preview→channel handoff on the same engine; translated to LiveKit Android this means `startLocalPreview()` → `promotePreviewToSession()` publishes the existing `LocalVideoTrack` and re-anchors renderer after `Room.connect()`.
- Android 15 / Pixel 9 native-library baseline remains mandatory: `android:extractNativeLibs="true"`, `jniLibs.useLegacyPackaging = true`, `android.bundle.enable16kAlignment=true`, with LiveKit 2.26.0 / MediaPipe 0.10.20 / Media3 1.5.1 not downgraded.
- Sources: LiveKit Android SDK renderer/track docs (`docs.livekit.io/reference/client-sdk-android/`), Android audio focus guide (`developer.android.com/media/optimize/audio-focus`), Android 16 KB page size guide (`developer.android.com/guide/practices/page-sizes`), Agora Android video best-practice pattern (`docs.agora.io/en/video-calling/best-practices`).

### Verified failure from uploaded video

- The recording shows the live room UI/chat/gift overlay still alive while the video area repeatedly becomes black. That rules out React route/render failure and points to native video renderer/track binding or camera capture continuity.

### Code gaps found

- `PrivateCallActivity.attachRemote()` and `attachLocal()` attached `VideoTrack.addRenderer(renderer)` without `Room.initVideoRenderer(renderer)`, violating the native renderer contract and causing black 1:1 call surfaces on fast handoffs.
- `PrivateCallActivity.attachRemote()` / `attachLocal()` could call `addRenderer()` again for the same `(track, renderer)` pair when flows re-emitted or Activity resumed, a known EGL/TextureView blanking trigger on Android.
- Live/party plugin paths already initialized renderers, but several paths used broad `runCatching` and still removed/re-added the same renderer aggressively; this phase tightens idempotent init and prevents duplicate add on the main local attach path.

### Implemented fix target

- Add explicit `IllegalStateException`-safe renderer initialization before every PrivateCallActivity track attach.
- Skip duplicate `addRenderer()` when the same track is already bound to the same renderer.
- Replace broad native live renderer init wrappers with a single `initVideoRendererIdempotent()` helper that only treats `Already initialized` as benign and logs other failures.

---

## Camera works in preview but fails in live/party/call — audit 2026-06-14

### Research baseline

- Professional Chamet/Bigo-class Android RTC keeps exactly one camera owner for the whole flow: prejoin preview → join room → publish → renderer rebind. Agora apps do this with `startPreview()` then `joinChannel()` on the same engine; LiveKit translation is `startLocalPreview()` then `promotePreviewToSession()` publishing the same `LocalVideoTrack`.
- LiveKit Android renderer rule remains mandatory: initialize the renderer for the active `Room` before `track.addRenderer(renderer)` and treat `IllegalStateException("Already initialized")` as benign during reconnect/network handoffs.
- Beauty must not open or own Camera2 during live media. The safe professional path is GPUPixel as a `VideoProcessor` on the existing LiveKit `LocalVideoTrack`; old “disable LiveKit camera → enable beauty camera → inject frames” handoff can produce CAMERA_IN_USE / black local publish.

### Verified current reason

- Preview works because it only creates a standalone LiveKit preview `Room`, starts one `LocalVideoTrack`, initializes one renderer, and does not publish to the SFU.
- Live streaming / video party / game party / private call add more failure points: token publish permission, Room connect, camera publish, renderer init, surface re-anchor, audio focus, network handoff, and beauty processor re-attach.
- The highest-risk remaining camera-kill path was the legacy beauty handoff: JS/native beauty enable could route through `setBeautyPipelineEnabled`, which previously disabled LiveKit's camera and expected a second GPUPixel camera pipeline. That conflicts with the Pkg416 single-camera contract and can leave live/party/call camera blank even though preview worked.

### Implemented fix

- `GPUPixelBeauty.setBeautyEnabled()` no longer routes to `NativeLiveKit.setBeautyPipelineEnabled()`; UI toggles now rely on `applyBroadcastBeauty()` / `setBeautyBroadcast()` only.
- `LiveKitPlugin.setBeautyPipelineEnabled()` and native private-call beauty handoff no longer disable/re-enable camera. They only attach/detach the GPUPixel `VideoProcessor` on the current LiveKit camera track.

### Verification required

- Requires Android APK rebuild. Test on owner account/device: GoLive preview → start live; video party seat publish; game party seat publish; private call accept; toggle Beauty on/off; expected: no camera restart, no CAMERA_IN_USE, local/remote video stays visible.

### Follow-up audit from camera-path subagent

- Party/video-game gap confirmed: when `cameraReady=false` at connect time, later `setCameraEnabled(true)` published a camera track but did not remount the native local renderer. Fixed in `nativeLiveKitController.setCameraEnabled(true)` by calling the existing `attachLocalWithRetry()` after a successful camera enable.
- Slow-OEM gap confirmed: native `attachLocal()` waited only 3s while OEM Camera2 open can take longer. Fixed by extending the native attach deadline to `OEM_CAMERA_OPEN_TIMEOUT_MS + 1500ms` so late-published local camera tracks still bind to the renderer.
- Private-call double-renderer/wrong-window risk remains an APK/device verification target because current JS usage does not show `openInCallActivity()` being called; do not remove WebView attach until the native activity launch flow is confirmed active on device.

---

## Android + web static scan hotfix — party bounded renderer — 2026-06-14

### Research baseline

- LiveKit Android requires `Room.initVideoRenderer(renderer)` before rendering and renderer binding should be idempotent; duplicate renderer paths are a black-surface risk on Android EGL/TextureView stacks. Sources: LiveKit Android `initVideoRenderer` docs and LiveKit Android sample renderer usage.
- Agora/Bigo/Chamet-equivalent pattern: one RTC engine/camera owner, preview/local canvas before join, then join/rebind surfaces without opening a second camera/renderer path. Sources: Agora Interactive Live Streaming Android quickstart + API-before-join best-practice docs.

### Verified current gap

- Party video/game native path used `attachLocal: true`, mounting the legacy fullscreen local renderer.
- Party UI also renders seats through `<NativeVideoView />`, which binds bounded native renderers via `attachLocalSurface` / `attachRemoteSurface`.
- Result: the same LiveKit camera/remote track could be bound to both legacy fullscreen and bounded seat renderers, especially after track-subscribe/reconnect sweeps, matching black seat/camera-in-room failures.

### Implemented fix

- Party native connect now passes `attachLocal: false`; bounded `<NativeVideoView />` owns party video/game seat rendering.
- `nativeLiveKitController` remembers per session whether legacy auto-local attach is allowed; late `setCameraEnabled(true)` only auto-attaches for live/call, not party bounded seats.
- `LiveKitPlugin.attachLocalSurface()` and `attachRemoteSurface()` remove/release any legacy renderer before binding bounded surfaces.
- `LiveKitPlugin.attachRemote()` now no-ops when `BoundedSurfaceHost` already owns that remote sid.

### Verification required

- Web reload applies TS changes immediately; Kotlin changes require APK rebuild.
- Device test: owner account → create/join video party and game party → take camera seat → remote viewer sees video → toggle camera off/on → leave/re-enter. Expected: no duplicate renderer, no black seat tile, no fullscreen wrong-window renderer.
