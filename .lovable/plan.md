
# Admin Panel Forensic Audit — Complete Visibility Plan


## 2026-07-17 Hotfix — Face Verification Admin Count Parity

- Problem confirmed from owner screenshots: User Hub and Face Verification tabs used different truth sources, so badges could show counts while the filtered list showed empty rows.
- Research-first notes: Chamet/Bigo/Poppo-style moderation queues separate **queue state** (pending/retry/rejected) from **account verification state** (profile face-verified). Professional admin panels must expose both, with server-side canonical buckets and no client-only re-bucketing.
- Root cause: the admin list/count RPCs were based on latest submission rows, while User Hub counted `profiles.is_face_verified`; legacy users can have profile verification without an approved submission row, and old retry/status metadata can make client filters disagree with server counts.
- Implementation direction locked: DB RPCs now return one canonical admin queue including read-only synthetic audit rows for legacy profile-verified users without fabricating submission evidence; evidence guard remains intact. Frontend must trust server `status_bucket` first so tab count and list cannot diverge.

## 2026-07-10 Hotfix — Go Live Preview Camera Continuity

- User requirement clarified: only the Go Live design/chrome should change; the camera itself must remain exactly the same continuous preview and must not visibly close/reopen when tapping Go Live.
- Research-first notes: LiveKit's publish flow keeps camera/mic as local participant media tracks after permission (LiveKit docs: publish user's camera/mic with `setCameraEnabled` / `setMicrophoneEnabled`, device permissions handled by native/mobile runtime). Agora's Android broadcaster flow similarly joins with `publishCameraTrack=true` / `publishMicrophoneTrack=true` in `ChannelMediaOptions`; professional apps preserve capture and swap UI chrome, not restart the camera.
- Code root cause found: native Android live host path was calling `connectAndPublish({ attachLocal: false })`, which told Kotlin to enter bounded-surface mode and detach the already-visible fullscreen prejoin renderer before LiveStream mounted a new `<NativeVideoView />`. Camera track promotion could still be intact, but visually the renderer was replaced, causing the "new/reopened camera" effect.
- Implementation direction locked: host live transition now keeps `attachLocal=true` so the existing native preview renderer remains attached while the same Camera2 `LocalVideoTrack` is promoted into the LiveKit room. LiveStream host path no longer mounts a second bounded native surface/placeholder; React live UI overlays sit above the already-running camera surface.

## 2026-07-10 Hotfix — Admin Cloud White Contrast Recovery

- Problem confirmed from admin Gmail/support screenshot: multiple admin surfaces had white/light text on white/light backgrounds after the Cloud White admin conversion, making dialogs, lists, chips, cards, and nested legacy pages unreadable.
- Research-first notes: professional admin consoles use light canvas + white raised surfaces + dark primary text, not white text on white cards. WCAG 2.1 requires at least **4.5:1** contrast for normal text and **3:1** for UI boundaries/icons. References: W3C WCAG Contrast Minimum, GitHub Primer color usage, Material 3 surface/elevation roles.
- Implementation direction locked: one global admin contrast layer in `index.css` plus shared admin style constants, so 400+ admin pages inherit readable text/background/border behavior without page-by-page patching.
- Cloud White remains sacred: page/sidebar/cards stay white/light, but text becomes slate/blue/semantic dark, inputs/tables/modals get visible borders, and strong colored chips/buttons keep white text only on real strong colored backgrounds.

## 2026-07-10 Hotfix — Google Play Paid-But-Not-Credited Recovery

- Root cause confirmed for app UID `0733697258`: Play Console showed Jul 8 payment, but `recharge_transactions`, `payment_transactions`, and `google_play_purchase_attempts` had no matching rows; profile had `total_recharged = 0`, so the user never received app credit.
- Additional DB root cause found during recovery: three legacy recharge triggers still referenced removed fields (`coins_added` / `coins_credited`), blocking valid `recharge_transactions` inserts. Fixed them to use current fields: `coins_received`, `coins_amount`, then `amount` fallback.
- Professional standard reference: Google Play Billing security/integration docs require server-side purchase verification, entitlement grant after verified purchase, idempotent token/order handling, and consumable purchase consume only after successful credit. RTDN should reconcile missed client calls.
- Implemented recovery: credited the missing Jul 8 Google Play purchase through a completed `recharge_transactions` row with Google Play reference, `coin_transactions` ledger row, recharge bonus pipeline, and admin log.
- Future hardening: `verify-google-purchase` now supports trusted service-role recovery calls from RTDN, `google-play-rtdn` forwards service-role auth and records processing errors/refunds, and Android Billing now sends `obfuscatedAccountId = userId` so orphan RTDN tokens can be matched to the buyer after APK rebuild.

## 2026-07-09 Hotfix — Google Play / Support Purchase Recovery

- Verified current DB had `coin_packages` configured: 6 active Play Store packages (`diamonds_7000_v2` → `diamonds_650000_v2`) with package bonuses already set.
- Verified first-recharge config is active: `bonus_multiplier = 2.0`.
- Fixed server recovery gap: `admin-verify-purchase` now uses `admin_recover_purchase_credit`, not raw `add_coins`.
- Recovery now records `recharge_transactions`, updates `profiles.total_recharged`, applies package bonus + first recharge + VIP/Noble bonus, writes wallet ledger context, and blocks duplicate Google Order IDs.
- Google Play server verification path `process_google_play_purchase` now returns `transactionId` correctly and applies bonuses against the real recharge row id.
- Support ticket recovery package dropdown now reads live `coin_packages` instead of hardcoded stale prices/packages.

ভাই, তুমি চারটা area-তেই deep forensic চেয়েছ। এটা একবারে করলে risky (400+ page, 300+ table)। তাই **6-phase delivery** — প্রতি phase-এ তুমি approve করলে পরের phase-এ যাব। প্রত্যেক phase-এর শেষে admin panel-এ visible হবে + realtime + CSV export।

## 🎯 লক্ষ্য
প্রতিটা beans/diamond/coin movement — কে দিল, কে পেল, কোথা থেকে এল, কোন device/IP থেকে হল — admin panel-এ ১০০% visible. কোনো silent flow থাকবে না।

---

## Phase 0 — Foundation (Universal Audit Trail) — **আগে এটা**

নতুন central table `wallet_ledger_audit` তৈরি — সব beans/diamond/coin movement এখানে auto-log হবে trigger দিয়ে।

Columns: `user_id, currency (beans/diamond/coin), delta, balance_before, balance_after, source_type (recharge/gift/task/reward/withdrawal/admin_adjust/game/pk/agency), source_id, source_table, payment_method, payment_reference, ip_address, device_id, user_agent, admin_id (if manual), metadata jsonb, created_at`

- Trigger বসাবো: `profiles.beans`, `profiles.diamonds`, `profiles.coins` column update হলে auto-insert row
- Backfill last 90 days from `coin_transactions`, `gift_transactions`, `recharge_transactions`, `daily_login_claims`, `rating_reward_claims`
- Admin page: `/admin/wallet-ledger` — user search + currency filter + source filter + date range + CSV export + realtime tail

**এটা foundation — বাকি সব phase এটার উপরে build হবে।**

---

## Phase 1 — Rewards & Daily Task Flow (তোমার #১ priority)

Pages audit + fix:
1. `AdminDailyTasks` — completed/pending/reward-paid columns যোগ, per-user task progress drilldown
2. `AdminNewHostLiveBonus` — কে কত ঘণ্টা live থেকেছে, কে bonus পেল/পেল না, missed reason
3. `AdminRatingRewards` — (আগেই fix করেছি, তবুও verify + rejected reason column visible)
4. `AdminDailyLoginRewards` — streak breaker log, claim history
5. `AdminInvitationRewards` — inviter→invitee chain, কে কার জন্য কত পেল
6. `AdminWelcomeBonus` + `AdminFirstRechargeBonus` — claim vs eligible mismatch

প্রত্যেক page-এ: **Realtime updates + "Suspicious activity" tab** (double-claim attempt, IP repeat, device repeat)।

---

## Phase 2 — Recharge/Purchase Full Tracking (তোমার screenshot-এর সমস্যা)

1. `AdminRechargeHistory` upgrade — সব source একসাথে: Google Play / Swift Pay / Helper Topup / Manual / Failed attempts
2. `google_play_purchase_attempts` table (আগেই তৈরি) — Admin panel-এ separate tab: pending verify, failed verify, orphan payment (user টাকা দিছে but verify হয়নি)
3. **নতুন page** `/admin/orphan-payments` — যেখানে user claim করছে টাকা দিছে কিন্তু আমাদের কাছে record নেই (তোমার `0733697258` case)
4. Play Console webhook receiver edge function — real-time purchase notification (RTDN) capture
5. Swift Pay/crypto — expired vs completed reconciliation view
6. Every recharge row-এ: gateway raw response JSON viewable (admin only)

---

## Phase 3 — User-Wise Beans/Diamond/Coin Ledger

1. `/admin/users/:id/wallet` — one user-এর সম্পূর্ণ lifetime ledger (Phase 0 table থেকে)
2. Timeline view: earned/spent/received/sent with source click-through
3. Balance reconciliation check — `profiles.beans` vs sum(ledger) mismatch alert
4. Suspicious pattern detector: sudden spike, midnight-only earning, same-IP cluster

---

## Phase 4 — Agency / Host / Helper Payouts

1. `AdminAgencyWithdrawals` — per-agency commission breakdown, tier verification, lock status
2. `AdminHelperWithdrawals` — approval chain, payment method visibility log
3. `AdminHostEarnings` — beans→diamond→cash conversion trail
4. Country payroll admin (CSA) — কে কত approve করল, audit
5. Withdrawal fraud signals: new device withdraw, first-day withdraw, mismatch payment method

---

## Phase 5 — Cross-cutting Admin Improvements

- Global admin search bar: user ID / phone / transaction ID / device ID → jump to full profile
- Admin action audit: প্রতি admin কী edit/approve/reject করল (already `admin_logs` আছে, UI enhance)
- Daily digest email to owner: yesterday's beans in/out, top earners, top spenders, anomalies
- Every admin table: CSV export, date filter, realtime toggle

---

## 🚦 Delivery Order
**আজ:** Phase 0 (foundation table + trigger + backfill) → এটা approve না করলে বাকি কিছু কাজ করবে না।
**তারপর:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 (এক এক করে তোমার approval-এ)।

## ⚠️ Honest Warnings
- Phase 0-এর backfill query 300k+ row scan করবে — off-peak চালাব
- Trigger overhead ~2-5ms per profile update — acceptable
- APK rebuild **লাগবে না** — শুধু admin panel + DB + edge function
- প্রত্যেক phase-এ owner account দিয়ে self-test করব

## Technical Details
- Ledger trigger: `AFTER UPDATE OF beans, diamonds, coins ON profiles`
- IP/device capture: existing `session_security_logs` + `device_tokens` join
- Realtime: Supabase Realtime channel per admin page, cleanup on unmount
- Export: server-side CSV via edge function (>10k rows), client-side for smaller
- RLS: শুধু `has_role(auth.uid(), 'admin')` — user_roles table থেকে

---

**Phase 0 approve করলে আজই foundation বানানো শুরু করব। "hyaan" বললেই start।**
