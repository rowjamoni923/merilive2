# Party Room — Professional Fix Plan (Chamet/Bigo parity)

UI/design unchanged. Only business logic, security, DB, real-time, native polish.
22 findings from research + code audit. 3 phases. Honest gap list at end.

---

## PHASE PR-1 — Security + Critical (Lovable only, no APK)

Pure SQL migration + 1 edge function + small RPC wiring on client.

### Migration 1: `party_room_security_hardening`
1. **Tighten `party_room_participants` UPDATE RLS** (P2-5 self-escalation hole) — block role/seat_number self-update; only allow `left_at`, `is_muted` self-update via column whitelist trigger.
2. **Tighten SELECT RLS** (P1-6) — limit to `authenticated`, only active rooms.
3. **`promote_party_participant(p_room_id, p_user_id, p_role)`** SECURITY DEFINER RPC (P0-3) — host-only, updates target row, logs to `admin_logs`.
4. **`reject_seat_request(p_request_id)`** SECURITY DEFINER RPC (P0-4) — host/admin only, atomic.
5. **`kick_party_participant(p_room_id, p_user_id, p_reason, p_duration_minutes)`** SECURITY DEFINER RPC (P0-1) — sets `left_at` AND inserts `live_bans` row, atomic.
6. **`enter_party_room` fix** (P2-6) — `ON CONFLICT (room_id, user_id) DO UPDATE SET left_at=NULL, joined_at=now(), role='host'` for host fast-path.
7. **`send_gift` validation** (P1-9) — add `receiver_in_room` check inside gift RPC.
8. **Seat request rate-limit trigger** (P1-8) — unique partial index `(room_id, requester_id) WHERE status='pending'`, returns nice error.

### Edge function: `party-room` (WebSocket) host-change DB sync
- P0-6: When in-memory host change happens, call `transfer_party_host` RPC via service client so DB matches WS state.

### Client wiring (PartyRoom.tsx)
- Replace `kickUser` direct UPDATE → call `kick_party_participant` RPC.
- Replace `promoteToAdmin`/`demoteFromAdmin` → call `promote_party_participant` RPC.
- Replace `rejectSeatRequest` direct UPDATE → call `reject_seat_request` RPC + `demoteToAudience()`.
- Client cooldown 30s on `requestSeat`.

**Verification (owner test account):** kick → re-join blocked, viewer self-promote attempt rejected, password room shows prompt (after PR-2), promote toast accurate.

---

## PHASE PR-2 — Broken features + UX professionalism (Lovable only)

### A. Host crash detection (P0-2)
Restore lightweight `party_rooms.is_active` Realtime subscription for non-host (NOT polling — use existing `party-room-participants-realtime` channel, add `party_rooms` UPDATE filter). When `is_active=false` arrives, viewers see "Host left" toast + auto-leave after 5s.

### B. Password + Entry Fee (P0-5, P0-7)
- `CreateParty.tsx`: add Password input (optional) + Entry Fee coins input (optional) → pass to `create_party_room`.
- `PartyRoom.tsx`: catch `password required` / `entry_fee_required` error → show shadcn `AlertDialog` modal → re-call `enter_party_room` with password OR confirm coin deduction.
- Show `🔒` badge + entry fee chip on locked room cards in lobby.

### C. Invite-to-seat real implementation (P1-1)
- New `seat_invitations` insert with 30s expiry.
- LiveKit DataPacket `seat_invite` → receiver gets shadcn modal "Host invited you to seat N — Accept/Decline (30s)".
- Accept → `approve_seat_request`-style RPC `accept_seat_invite`. Decline / timeout → auto-cleanup.
- `useSeatInvitationInbox` already wired on receive side; complete the dispatch.

### D. LiveKit join timing (P1-12)
Reorder: set `mediaReady=true` first → wait for LiveKit `isConnected` via effect → THEN `publishPartyEvent('participant_joined')`. Removes 1.5s join-notification delay.

### E. VAD memory leak (P1-2)
`useVoiceActivityDetection.ts`: store `{source, analyser}` pairs, `source.disconnect()` + `analyser.disconnect()` before rebuild on `peerStreams` change.

### F. Optimistic update race (P1-3)
Move seat-grant optimistic update to AFTER `approve_seat_request` RPC returns `ok:true`. On failure, no rollback needed.

### G. Per-seat bean attribution (P2-4)
`speaker_beans: Record<userId, number>` state — gifts with `receiverId` matching a seated speaker route to that speaker's bean counter; only host-targeted or seat-less gifts go to host pot.

### H. Dead code cleanup
- Remove `useSignalingSocket` export (P1-5).
- Remove 6 dead camera `useState`s in `ProfessionalAudioRoom` (P1-11).
- Delete `ChametStyleVideoRoom` + `ChametStyleGameRoom` if unmounted (P2-9, ~1.5K LOC bundle saving) — verify first.
- Replace dedup `useEffect` with insert-time dedup in `PartyRoom.tsx` (P1-4).
- Fix `Math.random()` in `ShootingStar` style props → `useMemo` (P1-10).
- Remove redundant `fetchParticipants()` after RPC (P1-13).

### I. WS edge function eviction resilience (P1-7)
On cold-start join, edge function loads room state from DB instead of assuming empty Map. Mark for deprecation comment — LiveKit handles all real-time now.

**Verification:** Host force-close → viewers see toast in <2s. Locked room → password modal. Entry fee → coins deducted atomically. Invite-to-seat → modal on receiver. Bean counter per seat correct on gift.

---

## PHASE PR-3 — Android Native (APK rebuild required, honest)

**Cannot be done from Lovable.** Lists exactly what user must build native-side.

### A. Foreground service for background audio (P2-7)
Kotlin: `PartyAudioForegroundService` with `foregroundServiceType="microphone"` — started on LiveKit connect, stopped on disconnect. Persistent notification "In Party Room — Tap to return". Fixes Android 8+ killing mic after ~60s background. Manifest `FOREGROUND_SERVICE_MICROPHONE` permission.

### B. Native VAP gift player (P2-8)
Tencent VAP SDK plugin already exists per Pkg438 memory. Wire gift dispatcher to route premium gift IDs through `NativeGiftAnimation.try*` helpers instead of WebView SVGA/Lottie players for hardware composite over camera/voice.

**Lovable side prep (still in PR-2):** I'll add a `useNativeGiftRouter` hook that detects native plugin availability and forwards; WebView fallback automatic on web.

---

## PHASE PR-4 (separate plan, not now)

- PK/games wiring to seat state (P2-3) — needs full design discussion
- LiveKit Egress recording for compliance (P2-10)
- `party_room_bans` per-room ban table (P2-2)
- Server-side chat moderation trigger (P2-1)
- WS edge function full deprecation (P1-7 follow-up)

---

## Honest Gaps Disclosure

After PR-1 + PR-2 + PR-3 complete:
- ✅ All security holes closed
- ✅ Host crash handled <2s
- ✅ Password + entry fee live
- ✅ Invite-to-seat works
- ✅ Per-seat bean economy
- ✅ Background mic survives (APK rebuild)
- ✅ Native gift polish (APK rebuild)
- ⚠️ PK matchmaking still uses level 5 gate from PK research, not wired to party seats yet → PR-4
- ⚠️ No session recording for moderation review → PR-4
- ⚠️ Chat moderation still relies on Comprehend client-side (LiveKit chat unfiltered) → PR-4

---

## Execution Order

Each migration call requires user approval, so I'll batch:
1. **PR-1 migration + edge function** → approve → wire client → owner test.
2. **PR-2 part A-D** (host-crash, password, invite, join timing) → owner test.
3. **PR-2 part E-I** (cleanup + per-seat beans + dead code) → owner test.
4. **PR-3 prep** (router hook only — full native work needs your dev env).

Confirm proceed and I start PR-1 migration immediately.