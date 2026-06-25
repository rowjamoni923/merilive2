# Random Match Call — Phase A (Chamet-tier, 0% gap target)

Goal: Close all 5 P0 gaps in a single, fully-verified pass. Each gap = DB + RPC + client + admin + verification. Nothing ships behind a flag; everything wired end-to-end. Research locked against Chamet/Olamet/Poppo/Hollah/Bigo patterns.

## UI unification update — 2026-06-25

- Research check: Chamet describes starting video chat through one matching feature / match button, and private matching as a single algorithmic flow rather than a separate failed/error surface (https://www.ichamet.com/help/faq/how-to-start-video-chat-session, https://www.ichamet.com/help/faq/how-does-private-matching-work).
- Research check: BIGO-style video interaction guides describe calls woven into one live/video flow, not a second unrelated purple failure layout (https://www.bigo.tv/blog/bigo-live-video-call).
- Implementation rule: `MatchCall` must render `PreMatchPrep` as the only non-call UI for prep, searching, matched, and error states. State may change labels/CTA only; no second full-screen random-call design.
- Verified UI numbers retained on the unified surface: random free window 60s by admin setting fallback, minimum billable/random window 60s, top-up hold based on admin max rate × preauth minutes.

---

## G1 — Gender filter actually enforced (currently advisory only)

**DB**
- `host_match_preferences.preferred_caller_gender` (`any|male|female`) already exists — add index.
- `random_call_queue.caller_gender` populated from `profiles.gender` on enqueue (server-side, not client).
- Matching RPC `find_random_match` rewrites WHERE clause: skip hosts whose `preferred_caller_gender` ≠ `any` AND ≠ caller gender.

**Client**
- `PreMatchPrep.tsx`: hide "any gender" toggle for hosts unless VIP≥3 (Chamet rule).
- Caller side: read-only badge "Matching ♀ hosts" if user filtered.

**Verify**: Seed 2 hosts (♀-only, any), seed 1 ♂ caller → only "any" host returned.

---

## G2 — Pre-match preview hardening (camera leak + ghost queue)

**DB**: `random_call_queue.preview_started_at`, auto-cleanup RPC `cleanup_stale_queue` (>90s idle removed).

**Client**
- `PreMatchPrep.tsx`: camera track stops on unmount, route change, tab hidden >5s, and on enqueue success.
- Heartbeat ping every 15s; missing 2 = server removes from queue.
- Cron-like edge function `random-call-janitor` runs every 60s.

**Verify**: Open prep → background app 2min → return → queue empty, camera released.

---

## G3 — Skip penalty + cooldown (anti-abuse, Chamet's core retention lever)

**DB**
- `random_call_skip_counters` already exists — wire properly.
- New `random_call_settings` cols: `skip_soft_cap`, `skip_hard_cap`, `skip_window_seconds`, `cooldown_seconds_soft`, `cooldown_seconds_hard`, `skip_diamond_penalty`.
- Trigger on `random_call_sessions` UPDATE (`ended_reason='skipped'` and duration<10s) → increments counter, applies cooldown row in `account_lockouts` scope='random_match'.

**Client**
- `MatchCallOverlay`: skip button disabled while cooldown active, shows "Next match in 15s".
- After hard-cap: "Too many skips — try again in 5 min" + optional diamond unlock.

**Admin**: `AdminRandomCallSettings.tsx` → new "Anti-abuse" panel with all 6 fields.

**Verify**: Skip 5 calls in 60s → 6th call blocked with countdown.

---

## G4 — Reconnect grace window (saves dropped revenue calls)

**DB**
- `random_call_sessions.disconnect_grace_until` timestamptz.
- `private_calls.reconnect_token` (uuid) + `reconnect_grace_until`.
- RPC `attempt_call_reconnect(session_id, token)` → if within 20s grace, rejoin same LiveKit room, resume billing clock without double-charge.

**Client**
- `CallProvider`: on LiveKit `disconnect` event → stay on call screen with "Reconnecting..." for 20s, retry token-fetch ×3.
- Other party sees "Partner reconnecting…" banner instead of immediate end.
- If grace expires → settle normally.

**Verify**: Force airplane mode mid-call for 15s → call resumes, billing continuous.

---

## G5 — Post-call rating + report (trust loop, drives matching weights)

**DB**
- New table `random_call_ratings`: session_id, rater_id, ratee_id, stars (1-5), tags text[], created_at. RLS: rater can insert once, both parties can read aggregate.
- `profiles.random_match_avg_rating`, `random_match_rating_count` (updated by trigger).
- Matching RPC: ratings ≥4.0 get +score boost in weighted engine (already exists, add field).

**Client**
- New `PostCallRatingSheet.tsx` — bottom sheet after call end (≥10s duration only).
- 5-star + chip tags (Friendly / Clear video / Boring / Inappropriate).
- Report button → existing `support_reports` flow with prefilled context.
- Auto-dismiss in 8s if ignored.

**Admin**: `AdminRandomCallOps.tsx` → "Low rated hosts" tab (avg<3.0, >10 ratings) for review.

**Verify**: End 10s+ call → sheet appears → submit → rating persists → host profile shows new avg.

---

## Verification matrix (must all pass before claiming done)

| # | Test | Pass criteria |
|---|------|---------------|
| 1 | Gender filter | ♂ caller never matched to ♀-only host |
| 2 | Queue ghost | 2min idle prep removes row |
| 3 | Camera leak | Backgrounding releases camera track |
| 4 | Skip soft cap | 3 fast skips → 15s cooldown |
| 5 | Skip hard cap | 5 fast skips → 5min lockout |
| 6 | Reconnect | 15s airplane → call resumes, no double-bill |
| 7 | Rating | 10s+ call → sheet → DB row → host avg updated |
| 8 | Settlement | Random→Private conversion still works |
| 9 | Admin panel | All new settings editable + reflected live |
| 10 | English UI | No Bangla strings in any new component |

---

## Execution order (one batch, sequential commits)

1. DB migration (one file: all 5 areas, GRANTs included)
2. Edge functions: `random-call-janitor`, update `random-match-enqueue`, `random-match-skip`, new `random-call-reconnect`, `random-call-rate`
3. Client: `PreMatchPrep`, `MatchCallOverlay`, `CallProvider`, new `PostCallRatingSheet`
4. Admin: `AdminRandomCallSettings` + `AdminRandomCallOps` updates
5. Run verification matrix via Playwright + owner test account
6. Report back with pass/fail table

No phase-B work mixed in. No flags. No "later". Approve and I ship.