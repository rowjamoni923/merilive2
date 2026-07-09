# Android UI Hardening — App-wide Stability Pass

96 pages in `src/pages`। "কোন UI না ভাঙা" মানে ৯৬টা page individually ঘষা নয় — cross-cutting foundation ঠিক থাকলে সব page একসাথে ঠিক হয়। Chamet/Bigo/Poppo-এর মতো apps যে ৪টা layer-এ smooth থাকে, সেগুলোই fix করছি।

## Phase 1 — Keyboard & Input (সবথেকে বড় pain point)

Chamet/WhatsApp behaviour:
- Input উপরে উঠবে, background compress হবে না।
- Chat/comment box keyboard-এর ঠিক উপরে থাকবে।
- Back gesture → keyboard hide, page না ছেড়ে।

Deliverables:
- `@capacitor/keyboard` plugin install + `Keyboard.setResizeMode({ mode: 'native' })` + `setScrollEnabled(false)`।
- Global `useKeyboardInsets()` hook → `--kb-height` CSS variable expose।
- Chat / Comment / DM / Support / PartyRoom / LiveStream comment composer-এ `padding-bottom: var(--kb-height)` wire।
- iOS-parity `enterkeyhint` + `inputmode` audit।
- Android manifest `windowSoftInputMode="adjustResize"` verify।

## Phase 2 — Safe-Area & Notch/Gesture-Bar

- `viewport-fit=cover` in `index.html` (already?)। Verify।
- Global CSS tokens: `--safe-top`, `--safe-bottom`, `--safe-left`, `--safe-right` → `env(safe-area-inset-*)`।
- All fixed headers/footers/bottom-navs → `padding-top: var(--safe-top)` / `padding-bottom: var(--safe-bottom)`।
- Sheet/Dialog/BottomSheet component audit → automatic safe-area।

## Phase 3 — Layout Stability

- Fixed viewport height bug: `100vh` → `100dvh` (dynamic viewport) app-wide replace।
- Image `width`/`height` attribute audit → prevent CLS।
- Long list → `react-window`/`react-virtual` audit (Chat threads, Follower lists, Gift history)।
- Overflow-x hidden root guard → horizontal scroll leak কখনো হবে না।
- Touch target minimum 44×44px audit (Tailwind size tokens)।

## Phase 4 — Perf & Smoothness

- React Query `staleTime` audit → duplicate refetch কমাবে।
- Route-level `React.lazy` + `Suspense` for heavy pages (Reels, LiveStream, PartyRoom already lazy)।
- Image lazy loading + `decoding="async"` audit।
- Framer Motion → `will-change` + `transform` GPU path verify।
- WebView hardware acceleration flag (Capacitor default ON, verify)।
- Font loading: `font-display: swap` + preload primary font।

## Verification Protocol

- Owner-account test on preview (smdollarex923@gmail.com) - top 15 flows: Home, Live, GoLive, Party, PrivateCall, Chat, DM, Support, Wallet, Recharge, Profile, Reels, Discover, Search, Settings।
- Playwright headless viewport 393×852 (Pixel-8) screenshot pass — visual diff → broken layout detect।
- APK rebuild + physical device smoke test (user side)।

---

# Rating Reward Decision Hardening — 2026-07-09

## Professional pattern research
- Chamet/Bigo/Poppo-style reward moderation must treat approve/reject as terminal, idempotent decisions: one pending row enters review, one admin action finalizes it, pending queue instantly removes it.
- User app should not keep resurfacing the active reward prompt after any submission is decided; final records belong in history/audit, not active claim UI.

## Fix applied
- `approve_rating_reward` now locks the claim row, credits reward once, and returns a safe already-processed result for duplicate clicks.
- Added `reject_rating_reward` RPC so reject uses the same server-authoritative, locked, audited path as approve.
- Admin Rating Rewards active queue now loads only `status='pending'`; approved/rejected items live only in Transaction History.
- User active Rating Reward row now loads only pending claims; approved/rejected decisions disappear instantly from the app surface.

## Purchase analysis status
- Google Play verified purchase path already writes `recharge_transactions` with `purchase_source='google_play'`, order/product/token fields, amount, coins, and completed status.
- User `0733697258` exists, but no `recharge_transactions` row matches this ID/order/reference; screenshot alone is an SMS/payment confirmation and is not proof of a Google Play credited transaction.

## Technical Details

```
Phase 1 files touched:
  - capacitor.config.ts (Keyboard plugin config)
  - src/hooks/useKeyboardInsets.ts (NEW)
  - src/index.css (--kb-height token)
  - android/app/src/main/AndroidManifest.xml (adjustResize)
  - ~15 composer components (padding-bottom wire)

Phase 2 files touched:
  - src/index.css (safe-area tokens)
  - src/components/layout/* (header/footer wire)
  - src/components/ui/sheet.tsx, dialog.tsx (safe-area)

Phase 3-4 = codemod-style sweeps across src/**/*.tsx.
```

## Scope Boundaries

- Design SACRED — colors, fonts, layout composition অক্ষত। শুধু stability primitive যোগ।
- Camera/LiveKit/VAP/SVGA/native gift animation code touch হবে না।
- Web + Android দুই platform-এ কাজ করবে (iOS bonus)।
- Admin panel already separate performance-locked → skip।

## Approach Question

৪ Phase একসাথে করব, নাকি Phase 1 (keyboard — সবথেকে বড় সমস্যা) দিয়ে শুরু করে user verify করার পর ধাপে ধাপে? Approve করলে জানাও কোনটা।

---

# Admin Payout Analytics DB Fix — 2026-07-03

## Issue
- Admin Dashboard / Payouts Analytics showed `column p.full_name does not exist`.
- Current `public.profiles` schema uses `display_name` + `username`; legacy payout/group RPCs still referenced `p.full_name`.

## Professional payout analytics standard
- Admin finance dashboards should aggregate real cash-out separately from internal virtual-currency movement.
- Payout reports should include category totals, transaction count, recipient count, daily rollups, and helper/host-level breakdowns.
- Query layer must be schema-version safe: use canonical profile fields and avoid old alias columns that no longer exist.

## Fix completed
- Replaced legacy `p.full_name` lookup in `compute_helper_diamond_payouts` with `COALESCE(display_name, username, helper_id)`.
- Replaced legacy `p.full_name` lookup/search in `search_group_members` with `display_name` + `username`, while preserving the returned `full_name` output for frontend compatibility.
- Verified active DB functions no longer contain payout-breaking `p.full_name` references.

## Verification
- Database migration executed successfully.
- Active function audit now returns no `compute_helper_diamond_payouts` / `search_group_members` `p.full_name` references.
- Existing unrelated linter warnings pre-date this migration and were not introduced by this fix.

---

# Live Host Hourly Bonus Accuracy Fix — 2026-07-07

## Professional pattern research
- Poppo/Chamet/Bigo-style host programs publish daily/hourly earning requirements and caps; pro implementations treat streamed time as a server-side earning ledger, not a UI timer. References reviewed: Poppo host salary/benefit pages and Chamet vs Poppo host earning comparison pages.
- Correct rule: fragmented live sessions inside the same 24-hour bonus day accumulate toward the configured paid-hour cap; streaming beyond the cap must not create extra payable hours.
- Android/WebView timers can pause in background, so the database must count from active stream heartbeats every minute; client minute ticks remain only as backup.

## Current gap found
- `new_host_live_bonus_progress` is empty, so no host has been paid through this bonus path yet.
- Current RPC depends on `record_host_live_minute` being called by the client card every 60s; if Android/WebView throttles JS, minutes are lost.
- Current logic counts active setting rows instead of enforcing `max_hours_per_day`, so a future 6/7/10-row config could overpay unless capped.

## Fix being applied
- Add server-authoritative minute accounting from `live_streams` rows with fresh host heartbeat.
- Accumulate 5/10/50-minute fragmented sessions into the same program-day buckets until the configured daily cap is full.
- Enforce `max_hours_per_day` across state, minute counting, and claiming so hosts can stream 6–10 hours but only the first configured paid hours receive bonus.
- Schedule a database cron tick every minute; keep client heartbeat as a backup, deduped by actual elapsed time.

