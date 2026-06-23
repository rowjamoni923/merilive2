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

## Questions before I start

1. **প্রথম priority কোনটা?** — P0 হিসেবে আমি face verification + host application + recharge/withdrawal ধরছি। আপনি কি অন্য কিছু আগে চান?
2. **All 18 flows একসাথে চান, নাকি top 5-7 আগে?** (একসাথে করলে ৬-৮ phase, কয়েক ঘন্টার কাজ; top 5 হলে ১-২ phase-এ শেষ)
3. **Push notification:** approve হলে FCM push পাঠাতে চান? (এখন কিছু flow-এ in-app only)

Confirm করলে Phase 1 audit থেকে শুরু করছি, প্রতি phase শেষে আপনাকে দেখিয়ে next phase-এ যাব।
