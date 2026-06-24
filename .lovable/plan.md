# Zero-Gap Admin Approval Sync — Full Audit & Fix

ভাই, এটা একটা বড় কাজ — পুরো app জুড়ে যেখানে যেখানে "user submits → admin reviews → approve/reject → user-side effect" flow আছে, প্রতিটাকে instant (realtime) bi-directional করতে হবে। আগে scope confirm করি, তারপর phase-by-phase implement।

## In-scope approval flows (সব টেবিল চেক করে identify করা)

| # | Flow | App table | Admin page | Edge fn |
|---|---|---|---|---|
| 1 | Face Verification | `face_verification_submissions` | `AdminFaceVerification` | `auto-face-verify`, `admin-rerun-face-verify` |
| 2 | Host Application | `host_applications` | `AdminHostApplications` | — |
| 3 | Host Conversion (user→host) | `host_conversion_requests` | `AdminHostConversion` | — |
| 4 | Helper Application | `helper_applications` | `AdminHelperApplications` | — |
| 5 | Helper Upgrade Request | `helper_upgrade_requests` | `AdminHelperRequests` | — |
| 6 | Helper Topup Request | `helper_topup_requests` | `AdminHelperRequests` | — |
| 7 | Helper Withdrawal | `helper_withdrawal_requests` | (Finance) | — |
| 8 | Agency Host Request | `agency_host_requests` | `AdminAgencies` | — |
| 9 | Agency Withdrawal | `agency_withdrawals` | (Finance) | — |
| 10 | Country Super Admin App | `country_super_admin_applications` | (CountryAdmin) | — |
| 11 | Recharge Transactions (manual) | `recharge_transactions` | `AdminFinance` | `admin-verify-purchase` |
| 12 | SwiftPay Topups | `swift_pay_topups` | `AdminFinance` | — |
| 13 | Helper Orders (manual approval) | `helper_orders` | `AdminHelperOrders` | — |
| 14 | Admin Device Approvals | `admin_allowed_devices` | `AdminDeviceApprovals` | — |
| 15 | Admin Pending Actions (2-step) | `admin_pending_actions` | (multiple) | — |
| 16 | Account Deletion Requests | `account_deletion_requests` | — | — |
| 17 | Payroll Requests | `payroll_requests` | — | — |
| 18 | Rating Reward Claims | `rating_reward_claims` | — | `verify-rating-screenshot` |

প্রত্যেকটার জন্য audit করব:
- **A. App→Admin instant:** submit হওয়ার সাথে সাথে admin list-এ আসে (Realtime subscription, no manual refresh)
- **B. Admin→App instant:** approve/reject এর সাথে সাথে user-side status, notification, UI update
- **C. Media visibility:** screenshots/videos/face photos admin panel-এ signed URL দিয়ে দেখা যায়
- **D. Notification:** push + in-app + email/SMS যেখানে applicable
- **E. RLS + grants:** admin role select/update পারে, user নিজের row দেখে
- **F. Idempotency:** double-approve/reject prevent

## Execution plan (phased — প্রত্যেক phase user-testable)

### Phase 1 — Audit & report (no code change)
- প্রত্যেক flow-এ Realtime publication enabled কিনা check (`ALTER PUBLICATION supabase_realtime`)
- Admin page-এ `useEffect` Realtime subscription আছে কিনা scan
- Edge function / RPC দিয়ে approve হলে user-side কোথায় listen করছে check
- Media bucket private হলে signed URL helper আছে কিনা
- **Output:** একটা table — কোন flow-এ কী gap, severity (P0/P1/P2)

### Phase 2 — Realtime publication + grants (DB only)
- Missing tables কে `supabase_realtime` publication-এ add
- Admin role-এ select/update grants confirm, RLS policies tighten
- One migration, fully reversible

### Phase 3 — App→Admin instant (admin panel side)
- প্রত্যেক admin approval page-এ Postgres Changes subscription wire up (INSERT/UPDATE → live list refresh, badge count update)
- AdminLayout-এ global pending-count badges (face verify N, host apps N, withdrawals N…)

### Phase 4 — Admin→App instant (user side)
- User-side hooks (e.g., `useFaceVerificationStatus`, `useHostApplicationStatus`) Realtime subscribe — approve/reject এর সাথে toast + UI transition
- Push notification dispatch from approval edge functions / DB triggers যেখানে missing

### Phase 5 — Media visibility (signed URLs everywhere)
- Face verification ✅ আগে fix করা, এখন verify
- Host application docs, helper KYC, agency proof, withdrawal proof, rating screenshots — সবগুলোতে signed URL with 10-year TTL fallback
- Admin panel viewer component reusable করা: `<AdminMediaPreview bucket=... path=... />`

### Phase 6 — Idempotency + audit log
- প্রত্যেক approve/reject কে `admin_logs`-এ record
- Double-approve guard: `status IN ('pending')` check on UPDATE
- Race-condition: approval edge functions-এ row-level lock

### Phase 7 — End-to-end test (owner account)
- Owner account দিয়ে প্রত্যেক flow submit → admin login → approve/reject → user-side change verify
- Screenshot evidence, console clean

## Technical notes (for me — non-technical user ignore করতে পারে)

- **Realtime:** `useEffect` inside admin page + `supabase.removeChannel` cleanup (per mem rule)
- **No polling, no visibility-refresh** (per project Core memory)
- **English-only UI strings** for all new toasts/messages
- **APK rebuild:** শুধু React/edge code touch করব → APK rebuild লাগবে না। যদি কোনো native admin notification handler দরকার হয়, আলাদা করে জানাব।
- **Owner test account:** smdollarex923@gmail.com দিয়ে নিজেই end-to-end verify করব

## Avatar admin research note — 2026-06-23

- Bigo Live’s public safety/reporting guidance centers moderation on the reported user/content identity, so admin rows must show the same visitor-facing user profile/photo context when reviewing abuse or account actions. Source: https://www.bigo.tv/blog/report-on-bigo-live
- Chamet moderation guidance describes content/user safety review as profile-linked moderation, matching the requirement that admin panels identify every user/host visually, not only by UID. Source: https://chametacademy.com/chamet-content-moderation-how-it-protects-your-digital-space/
- Comparable live-streaming admin products advertise real-time user/stream/gift/admin modules across dozens of pages; consistent profile imagery across management modules is table-stakes for operator scanning. Source: https://teraa.live/admin.html
- Implementation implication: admin avatars should use `avatar_url` when present and deterministic user-level seed fallback (`user_id` / row `id`) when not; nested joined profile objects do not always expose `id`, so React/TS must not read `profile.id` unless the local type includes it.

## Face verification + media icon audit — 2026-06-23

- Chamet-style host face verification is an active liveness workflow, not a static file-picker: Chamet guidance describes mandatory host face verification, and current app logic already uses front/left/right liveness steps. Source: https://chametagency.id/how-to-complete-chamet-live-face-verification/
- Bigo host verification uses admin-only identity/selfie review; operator/admin media must be real reviewable photos/videos, not placeholders or generic icons. Source: https://peakentertainmentph.com/how-to-upload-my-id-for-host-verification-in-bigo/
- Android/Capacitor camera-preview white-screen cases commonly come from camera surface + WebView overlay/z-order/background issues; professional fix is native camera behind transparent UI, not another WebView camera probe. Source: https://forum.ionicframework.com/t/camera-preview-shows-white-screen-in-apk-overlay-visible-but-camera-not-displayed/242597 and https://github.com/capacitor-community/camera-preview/issues/199
- Android messaging guidance says media thumbnails provide quick visual previews, save bandwidth/memory, and improve browsing performance; video messages should render actual media/posters, not generic video icons. Source: https://developer.android.com/social-and-messaging/guides/media-thumbnails
- P0 fixes applied: FaceVerification native CameraX mode now uses a full-screen transparent React overlay so opaque cards/page backgrounds cannot cover the camera; host intro video now generates a canvas poster and renders a real playable `<video controls preload="metadata">`; direct chat media resolves stored `chat-media` paths through long-lived signed URLs, renders photos/videos as real media, and disables the optional text-only native chat overlay when a thread contains media.
- Honest verification note: Lovable preview can verify React/web rendering only. Native CameraX visibility requires APK rebuild + Android device test because `android/app/src/main/java/com/merilive/app/plugin/NativeCameraPlugin.java` behavior is inside the installed APK.
- Follow-up camera regression fix (2026-06-24): widened the native Face Verification transparency rule to include `#root` + page/scroll shells marked with `data-face-verification-*`, and removed the early hard-fail that rejected CameraX before analyzer frames were warm. This preserves the real native camera preview while the 3-API auto approve/reject pipeline continues to run after submission (`face-verification-analyze` → `service_auto_finalize_face_verification`). APK rebuild + physical Android test is still required before claiming 100% device verification.
- Audit follow-up: `ProCameraEngine` / `useProCamera` were stubbed during the 2026-06-14 camera rebuild, so Face Verification no longer blocked Live/Party/Private Call camera conflicts. Restored a lightweight JS family arbiter (`streaming` vs `verification`) so Face Verification refuses to open while streaming-family owners are active, and streaming prejoin refuses to open while Face Verification owns CameraX. This is a React-side guard; native CameraOwnership remains a separate APK-level concern.

## Questions before I start

1. **প্রথম priority কোনটা?** — P0 হিসেবে আমি face verification + host application + recharge/withdrawal ধরছি। আপনি কি অন্য কিছু আগে চান?
2. **All 18 flows একসাথে চান, নাকি top 5-7 আগে?** (একসাথে করলে ৬-৮ phase, কয়েক ঘন্টার কাজ; top 5 হলে ১-২ phase-এ শেষ)
3. **Push notification:** approve হলে FCM push পাঠাতে চান? (এখন কিছু flow-এ in-app only)

Confirm করলে Phase 1 audit থেকে শুরু করছি, প্রতি phase শেষে আপনাকে দেখিয়ে next phase-এ যাব।
