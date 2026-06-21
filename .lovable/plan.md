
# New Host Daily Live Bonus — 100% Professional Completion Plan

Industry research summary (Bigo, Chamet, Poppo, Olamet, MICO, Hollah → full table in research output):

| Pattern | Adopt? | Why |
|---|---|---|
| **Poppo-style per-hour tier** (hour 1 = X beans, hour 2 = Y, … cap = max_hours_per_day) | ✅ | Admin panel already supports `hour_number` + `bonus_beans` + `target_minutes` rows |
| **Olamet-style manual Claim button** per hour-tier | ✅ | User explicitly asked "claim করে নেবে"; boosts engagement |
| **Server-side time accumulation from `live_streams` session end** (not client heartbeat) | ✅ | Industry-standard fraud guard. No phone-farm hour-stuffing. |
| **Per-date isolation + hard expiry** ("unclaimed = forfeited next day") | ✅ | User's exact requirement: 21 তারিখ আলাদা, 22 তারিখ আলাদা |
| **Min session floor ≥10 min** + face-verified host gate | ✅ | Anti-fraud universal pattern |
| **Daily reset = same as other tasks** (Europe/London 00:30, `getTaskDate()`) | ✅ | Already used app-wide for `daily_tasks` |

---

## Current Gaps (audit confirmed)

| # | Gap | Impact |
|---|---|---|
| 1 | `new_host_live_bonus_progress.hours_completed` কখনো increment হয় না | পুরো system dead |
| 2 | Per-hour tier-wise claim state (which hours claimed) DB-তে নেই | একই hour বার বার claim হতে পারে |
| 3 | Tasks page-এ Claim button নেই (read-only progress) | User claim করতে পারে না |
| 4 | Session-end এ live duration calculate করে bonus progress update করে এমন trigger/edge function নেই | Hours auto-credit হয় না |
| 5 | Admin panel-এ "today's bonus payouts / eligible hosts" stats nei | Admin verify করতে পারে না |

---

## Implementation (3 phases, all in Lovable preview — no APK rebuild)

### Phase 1 — DB foundation (migration)

**1.1** Add `claimed_hours INTEGER[]` column to `new_host_live_bonus_progress` (tracks which hour_numbers user has claimed today). Add `last_session_ended_at TIMESTAMPTZ` for incremental accumulation. Add `total_live_seconds_today INTEGER`.

**1.2** Add `min_session_minutes INTEGER DEFAULT 10` to `new_host_live_bonus_settings` (anti-fraud floor — sessions shorter than this don't count).

**1.3** Replace `claim_new_host_live_bonus` RPC with new signature:
```
public.claim_new_host_live_bonus_hour(p_hour_number INT) → json
```
Returns `{success, beans_credited, hour_number, error}`. Server-side checks:
- `auth.uid()` matches, host + face-verified
- Within `eligible_days` window
- That `hour_number` row exists in settings and `is_active`
- Today's `total_live_seconds_today >= target_minutes * 60` for that hour
- `hour_number NOT IN claimed_hours` (idempotent)
- Atomic UPDATE: append to `claimed_hours`, increment `profiles.beans + pending_earnings + total_earnings`
- Insert `balance_audit_log` row for traceability

**1.4** New RPC `public.accumulate_host_live_seconds(p_stream_id UUID)` (security definer). Called when a `live_streams` row gets `ended_at` set (via trigger). It:
- Computes `session_seconds = ended_at - started_at`
- If `< min_session_minutes * 60` → discard (anti-fraud)
- Looks up host's bonus eligibility (host, face_verified, in eligible_days window, active settings)
- Upserts today's `new_host_live_bonus_progress` row, `total_live_seconds_today += session_seconds`, recomputes `hours_completed = total_live_seconds_today / 3600`

**1.5** AFTER UPDATE trigger on `live_streams` (when `ended_at` transitions from NULL → NOT NULL) calls `accumulate_host_live_seconds(NEW.id)`.

**1.6** Safety-net: also accumulate live seconds for currently-active streams via a cron-callable function `accumulate_active_streams_tick()` (every 5 min) — so abandoned/crashed sessions still credit time. Uses `last_session_ended_at` watermark to avoid double-counting.

### Phase 2 — UI claim flow (Lovable, web)

**2.1** Tasks page (`src/pages/Tasks.tsx`): Replace read-only bonus card with **per-hour tier grid**. Each tier shows:
- Hour number + target ("Hour 5 — 5h live")
- Bonus amount ("50,000 🫘")
- State: `locked` (not yet eligible time-wise) / `claimable` (green Claim button) / `claimed` (greyed ✓) / `expired` (next-day reset)
- Progress bar: current minutes / target minutes for the active hour

**2.2** Claim button → calls `claim_new_host_live_bonus_hour(hour_number)` RPC → toast + balance update + local state.

**2.3** Live room (`LiveTasksCard.tsx`): same per-hour mini-strip when host is streaming, so they can claim mid-stream without leaving live.

**2.4** Realtime subscribe to own `new_host_live_bonus_progress` row → instant tier-unlock animation when threshold crossed.

### Phase 3 — Admin verification & test

**3.1** `AdminTasksSettings.tsx`: add read-only "Today's Stats" panel — eligible hosts count, total bonus paid today, top earners list. Pulls from `new_host_live_bonus_progress` joined with `profiles`.

**3.2** Add `min_session_minutes` field to admin form.

**3.3** Owner test (smdollarex923@gmail.com): go live for 12 min in preview → verify `total_live_seconds_today` updates after end → verify Hour 1 tier becomes claimable → claim → verify beans credited + audit log row + cannot re-claim same hour. Verify next-day reset boundary by manipulating `bonus_date` test-row.

---

## What stays untouched (sacred)

- LiveKit / Camera / GPUPixel / VAP / SVGA / animation paths
- Reels redesign, all minimal-pro UI work done so far
- Other task types (`live_minutes`, `viewers`, `first_gift`) and `daily_tasks` flow
- All English UI strings (no Bangla in code)

---

## Verification gates

1. Migration linter clean (no RLS errors, GRANTs present)
2. Owner-account end-to-end live → claim → re-claim-blocked test passes
3. Two consecutive days (manual `bonus_date` row insert) show independent claim quotas
4. Sub-10-min session = no bonus credited

Confirm, and I'll start with Phase 1 migration.
