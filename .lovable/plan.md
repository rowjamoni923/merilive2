
# Random / Match Call — Chamet-Parity Rebuild Plan

Goal: 100% professional, Chamet-level behavior. Zero gaps, zero wrong calculations, zero broken UI. Built on our existing LiveKit + Supabase stack, reusing the proven private-call infrastructure.

Research-backed (Chamet, Poppo, Olamet, Bigo, Hollah, WeJoy, HiiClub, Crush Live — June 2026). Every number below is sourced; nothing invented.

---

## What we have today (foundation, keep)
- `random_call_settings` / `random_call_queue` / `random_call_sessions` / `random_call_skip_counters` tables
- Edge functions: `random-call-enqueue`, `random-call-cancel`, `random-call-settle`
- `claim_match` RPC (atomic FIFO claim) + `settle_random_call` RPC (40s rule + per-min billing)
- `MatchCall.tsx` (globe search UI) + `AdminRandomCallSettings.tsx`
- Handoff to `CallProvider.startCall()` so LiveKit reuse is already wired

## What is missing vs Chamet (the gap we are closing)
1. Host has **no explicit "Available for Match" toggle** — hosts get pulled in blindly
2. No **weighted scoring** — pure FIFO, ignores verification / VIP / level / engagement / quality
3. No **gender / country / language filter** logic at queue level (schema fields unused)
4. No **same-pair re-match block** (30 min)
5. No **skip cooldown enforcement** (counter exists, never read)
6. No **host accept window** (15s ring → auto-reject + no penalty)
7. No **reject-rate tracking** for host ranking
8. No **"Next" button** in-call → re-queue with one tap
9. No **pre-match prep screen** (self-camera preview, beauty filter, mic test, balance check, est. wait)
10. No **post-call rating** prompt (1–5 stars feeds host quality score)
11. No **free-trial seconds** (welcome-bonus diamonds field exists, not enforced as "free seconds")
12. No **VIP / SVIP queue priority** path (3–8 min vs 15–45 min)
13. No **reconnect window** pause (network drop bills the gap)
14. No **multi-device session bump** for match queue
15. Admin panel missing many of the above knobs

---

## Phase plan (build in this order, each phase ships verified)

### Phase 1 — Schema + Host Availability (foundation)
- Extend `random_call_settings` with the full Chamet config block (see Technical section)
- New table `host_match_availability` — explicit on/off toggle per host with `auto_on_when_live` flag, `last_active_at`, `idle_timeout_seconds`
- New table `recent_match_pairs` (`user_a`, `user_b`, `matched_at`) + pg_cron purge >30 min
- New table `host_match_stats` (rolling 7-day acceptance %, completion %, avg duration, report count) — recomputed by trigger on each settle
- Add **Host Match Toggle** card on Host Dashboard (Profile → Host area) with live "you are online for match" indicator
- Auto-turn-ON when host goes Live; auto-turn-OFF on idle >5 min

### Phase 2 — Weighted Matching Engine
- Rewrite `claim_match` RPC to use the documented Chamet 6-factor composite score:
  - Verification 20% (phone +5, email +5, face +10)
  - VIP/SVIP 20% (SVIP=full, VIP=half)
  - Real-time engagement 20% (responded <10s recently = max)
  - Profile completion 15%
  - User level 15%
  - Historical quality 10% (acceptance × completion × avg rating)
- Apply filters before scoring: gender preference, country (SVIP), language (SVIP), same-pair block, online toggle
- Queue resort tick every 30s via pg_cron
- Caller side: SVIP gets 3–8 min priority lane, regular gets standard, free gets fallback

### Phase 3 — Caller Pre-Match Screen
- Replace current spinning-globe page with Chamet-style **pre-match prep**:
  - Self-camera preview (LiveKit standalone preview, same as Go Live native plugin)
  - Beauty filter toggle (reuse `beauty_filters` settings)
  - Camera flip + mic indicator
  - Diamond balance + "Top Up" shortcut if < cost of 1 min
  - Available hosts count + estimated wait time
  - Gender / Country / Language chips (locked icon for non-VIP)
  - Big "Start Match" CTA
- Then transition to search animation (keep current luxe globe)

### Phase 4 — In-Call Layer (Next button + 40s rule polish)
- Add **"Next" button** bottom-right of `CallScreen` when call type = `random_match`
- Tap Next: end current call → auto re-enqueue → straight back to search screen (no UI flicker)
- Server-side: tighten `settle_random_call` to:
  - <5s = zero-charge grace cancel (no bill, no host bean)
  - 5–40s = no host bean, no caller charge (free preview window — Chamet-style)
  - ≥40s = bill caller per second from start, credit host 60% per-min rate
  - Pause billing on `Reconnecting`, resume on `Reconnected`, terminate if >30s gap
- Add **post-call rating sheet** (1–5 stars + quick-reason tags if ≤2) → writes to `host_match_stats`

### Phase 5 — Skip Cooldown + Anti-Abuse
- Enforce skip cooldown server-side in `random-call-enqueue`:
  - 5 skips in 60s → 30s cooldown
  - 10 skips in 5 min → 60s cooldown
  - VIP × 0.5, SVIP × 0.25 multiplier
- Same-pair block check (read `recent_match_pairs`, reject re-match within 30 min)
- Host accept window: 15s ring → auto-reject (no host penalty, treated as caller timeout)
- Reject-rate tracking: <40% over 7 days = queue suppression flag; >95% = bot flag for review
- 3 reports in 24h → 12h queue ban (writes to existing `live_bans` style table)

### Phase 6 — Reconnect + Multi-Device Safety
- LiveKit `Reconnecting` event → server billing pause via heartbeat
- 30s reconnect window; on expiry → end call cleanly, refund unused seconds
- Multi-device: Supabase Realtime presence on `match:user:{id}` channel — new device entering match feature bumps old device with toast "Match active on another device"

### Phase 7 — Admin Panel Completion
Extend `AdminRandomCallSettings.tsx` with all knobs:
- Pricing: rate per host level (Lv 0–2 / 3–6 / 7–10), revenue share %, currency rate
- Free trial: welcome seconds, daily free seconds, grace window (5s), free preview window (40s)
- Matching: queue resort interval, accept window, same-pair block min, match timeout
- Skip: trigger count, soft/extended cooldown, VIP multipliers
- Filters paywall: which tier unlocks gender/country/language/age
- Anti-abuse: min acceptance %, max acceptance %, report-suspend threshold, suspended duration
- Live stats card: today's matches, success rate, avg duration, active hosts in pool

### Phase 8 — Verification + Owner Test
- Owner account end-to-end test (smdollarex923@gmail.com): enqueue → match → 4s cancel (no charge) → re-match → 30s call (no charge, free preview) → 90s call (billed correctly) → Next button → cooldown trigger → rating submit
- Cross-check `coin_transactions` rows match expected formula to the second
- Verify host bean credit + 60% split landing in host wallet
- Confirm CSA diamond ledger (per existing memory) untouched by match calls (random match settles in beans, not CSA scope)

---

## Technical reference (for builders)

### Score formula (Phase 2)
```text
composite = 0.20*verification + 0.20*vip_tier + 0.20*engagement
          + 0.15*profile_completion + 0.15*level_norm + 0.10*history
recent_30d events weighted 3× vs older
```

### Billing state machine (Phase 4)
```text
CONNECT  →  t=0..5s      → GRACE        (cancel = $0)
         →  t=5..40s     → FREE_PREVIEW (no host bean, no charge)
         →  t≥40s        → BILLABLE     (per-second from t=0)
RECONNECTING → pause billing
RECONNECTED  → resume
RECONNECT_TIMEOUT(30s) → END, settle with paused-time excluded
```

### Same-pair block
```sql
INSERT INTO recent_match_pairs(user_a,user_b) VALUES(LEAST(a,b),GREATEST(a,b));
-- In claim_match: WHERE NOT EXISTS (... matched_at > now()-interval '30 min')
```

### Skip cooldown (server)
```text
skips_60s = count(skip_events WHERE user_id=? AND ts > now()-60s)
if skips_60s >= 5 → cooldown = 30s (× vip_mult)
if skips_300s >= 10 → cooldown = 60s (× vip_mult)
```

### Memory rules honored
- LiveKit self-hosted at `wss://livekit.merilive.xyz` (no migration)
- All UI strings in English (toasts, sheets, errors)
- Admin panel = single source of truth for every number above
- Design-sacred lifted (mobile redesign allowed); native camera path untouched
- Will use owner test account for verification, not ask for credentials

---

## Out of scope (deliberately deferred — ask if you want any added)
- Voice-only random match (Chamet has it, we do video-first)
- Beauty filter changes mid-call (only pre-match toggle in Phase 3)
- AI face-check during preview (not done by any competitor; Chamet does it at signup + payout only — already covered by our FaceVerification system)
- Party-Match (group random) — separate feature, not in this plan
- Friend-add CTA on post-call screen — small follow-up, can add in Phase 4 if you want

---

## Deliverable per phase
Each phase = its own message: migration → edge fn → UI → owner-account test → "verified, on to next." No dumping everything at once. If anything breaks mid-phase I stop and fix before moving on.

Approve and I start with Phase 1 (host availability + schema foundation). Or tell me to reorder.
