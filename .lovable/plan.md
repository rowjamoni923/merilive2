# Plan: Live Stability + Instant Reports + 95% Face Auto-Approve

This touches three independent pillars. Each pillar starts with research (per research-first rule), then implementation, then verification with the owner test account.

---

## Pillar 1 — Live / Party Room never auto-closes (host-only end)

**Goal:** A live stream or party room may ONLY end when the host taps the in-app End button. No background process, no heartbeat miss, no presence drop, no app-backgrounded event may flip `live_streams.is_active=false` or `party_rooms.status='ended'`.

### Investigate (read-only)
1. Grep all writes that set `is_active=false` / `status='ended'` / `ended_at`:
   - `live_streams`: client code, edge functions (`livekit-*`, `host-heartbeat`, `live-stream-end`), DB triggers, cron RPCs.
   - `party_rooms`: same sweep.
2. Identify every auto-close path:
   - Heartbeat / presence timeout RPCs
   - LiveKit `room_finished` / `participant_left` webhook handlers
   - Visibility/blur listeners in `GoLive*`, `PartyRoom*` pages
   - Face violation auto-kick (`live_face_violations`)
   - Battery/Camera ownership teardown
3. Check Supabase logs for the owner account's recent live sessions — find rows where `ended_at` was set without a corresponding "user pressed End" client event.

### Fix
- Gate every non-host close path behind an explicit `close_reason` enum and require `close_reason='host_ended'` OR `close_reason='admin_force'` to actually flip `is_active=false`. All other reasons (heartbeat miss, webhook, visibility) downgrade to a `grace` state, never terminate.
- Replace heartbeat-based termination with a **30-minute hard idle timeout** (no participant + no heartbeat for 30 min) instead of the current short window. Background/foreground transitions must NOT count as idle.
- LiveKit `room_finished` webhook: only end the DB row if the host explicitly disconnected via the End button (client emits `host_ended=true` before disconnect; webhook checks that flag).
- Party room: same pattern — only the owner's explicit "Close Room" button writes `status='ended'`.
- Add `close_reason` + `closed_by_user_id` columns to both tables for audit.

### Verify
- Owner-account E2E: go live, lock phone 5 min, unlock — stream still active.
- Go live, kill network 2 min, restore — stream still active.
- Tap End — stream ends within 1s.
- Same matrix for party room.

---

## Pillar 2 — Instant Admin reports (no missed reports)

**Goal:** Every `user_reports`, `reel_reports`, `support_reports`, `host_contact_violations`, `live_face_violations`, `chat_moderation_logs` insert appears in the admin panel within 1s, with a counter bump and a toast.

### Investigate
1. Confirm each report table is in `supabase_realtime` publication.
2. Audit `AdminLayout` / `AdminDashboard` / `AdminReports` / `AdminSupportReports` realtime subscriptions — confirm they cover all 6 report tables, not just one.
3. Verify `admin_layout_counts()` RPC includes pending counts for every report category.
4. Check RLS: admin role must SELECT all rows (no `auth.uid()` scoping that hides reports from other users).

### Fix
- Add any missing tables to the realtime publication via migration.
- Extend `admin_layout_counts()` to return per-category pending report counts.
- Centralize admin realtime in one `useAdminReportsRealtime` hook that subscribes to all 6 tables once and dispatches to a shared cache (avoids duplicate channels and missed events when navigating tabs).
- Optimistic counter bump on INSERT event; toast with deep-link to the new report.

### Verify
- Owner-account: file a user report from preview → admin badge increments within 1s on another tab.
- Repeat for each of the 6 report types.

---

## Pillar 3 — Face Verification: 95% auto-approve target

**Goal:** Of all new-account submissions where photo + video + liveness are the same real person, ≥95% auto-approve with no manual review. Manual queue ≤5%. Three rejection rules unchanged (gender mismatch → reject + contact support; duplicate face → reject + show original account; bad media → retry).

### Investigate
- Pull the last 100 submissions: bucket by final outcome (approved / rejected / needs_retry / under_review) and by rejection reason. Identify what's currently pushing same-person submissions into `under_review` or `needs_retry`.
- Re-read `face-verification-analyze` edge fn + `service_auto_finalize_face_verification` RPC end-to-end.

### Fix (within existing "Strong Identity Override" framework)
- **Combined identity score:** weight photo↔video similarity 60%, photo↔live 40%. If combined ≥ 80% → auto-approve (was 85% on either pair alone).
- Drop occlusion/blur/lighting from blocking signals entirely when combined identity ≥ 75%.
- Lower face-confidence floor from 55 → 50.
- Keep HARD blocks only:
  1. Duplicate face hash (across distinct user_ids) → reject + show original Name + Profile ID
  2. Detected gender ≠ account gender (both ≥ 60% confidence) → reject + contact support
  3. Liveness completely failed (no face in video at all, or > 8s no movement) → retry
- Everything else (low confidence, partial occlusion, single bad still) → fall through to approve if combined identity ≥ 75%.
- If Rekognition itself errors / times out → retry (not under_review).

### Verify
- Re-run the last 100 submissions through the new logic in a dry-run script; confirm ≥95% auto-approve rate for non-duplicate, gender-matched submissions.
- Owner account: submit fresh verification → instant approve within 8s, English push notification.

---

## Execution order

1. Pillar 1 investigation (read-only grep + log query) → migration + code fix → owner E2E.
2. Pillar 2 investigation → migration + hook + counter fix → owner E2E.
3. Pillar 3 investigation → RPC tuning → dry-run + owner E2E.

Each pillar ships independently. No design changes anywhere — logic only.

---

## Open question

Pillar 1's 30-minute idle timeout: keep at 30 min, or remove timeout entirely (live stays "active" forever until host taps End, even if host's phone is dead for hours)? The latter is what TikTok/Bigo do NOT do — they cap idle at ~5-10 min. Confirm your preference before I lock the number.
