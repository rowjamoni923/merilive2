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

### A. Host crash detection (P0-2) — ✅ already wired
Realtime `party_rooms` UPDATE channel (`party-room-end-${roomId}`) already auto-closes viewers on `is_active=false` / `ended_at` set + LiveKit `room_state_changed` packet (PartyRoom.tsx 1275-1304, 1236-1244). No further work.

### B. Password prompt on join — ✅ done (PR-2.1)
`enter_party_room` already supports `p_password`. PartyRoom intercepts `Password required` / `Invalid password` errors and shows an `AlertDialog` with password input → retries `joinRoom(pwd)`. `Insufficient coins for entry fee` shows toast + bounces to lobby.

### B-create. Password + Entry Fee on creation — ✅ done (PR-2.2)
Migrated `create_party_room(p_entry_fee int default 0)` (0-100000 cap). CreateParty.tsx now has a Lock-icon button next to the Wand2 effects button → opens a `Dialog` with Password + Entry Fee inputs. State stored locally; passed to the RPC on `Let's Party`. Active settings show an amber dot + ring on the Lock button.

### C. Invite-to-seat real implementation (P1-1) — ✅ already wired
`seat_invitations` table + `accept_seat_invitation` / `decline_seat_invitation` RPCs + `useSeatInvitationInbox` + `SeatInvitePickerSheet` + `SeatInviteResponseSheet` are all live. No further work.

### D. LiveKit join timing (P1-12) — ✅ done (PR-2.1)
`joinRoom` now stashes the `participant_joined` payload in `pendingJoinPublishRef`; a dedicated effect flushes it the moment `isConnected` flips true. Eliminates the 1-3s "join packet dropped before SFU connected" race.

### E. VAD memory leak (P1-2) — ✅ done (PR-2.1)
`useVoiceActivityDetection` now stores `{source, analyser}` pairs and calls `source.disconnect()` + `analyser.disconnect()` before every rebuild and on unmount. Fixes orphan `MediaStreamAudioSourceNode`s on long sessions.

### F. Optimistic update race (P1-3) — ✅ done (PR-2.1)
`approveSeatRequest` now hides the request row optimistically but only grants the seat AFTER `approve_seat_request` RPC returns `ok:true`. Eliminates phantom-speaker flicker on `seat_taken` / `already_handled` rejections.

### G. Per-seat bean attribution (P2-4) — ⏭️ deferred to PR-2.2
Needs gift handler refactor + UI counter wiring; left for next pass.

### H. Dead code cleanup — ⏭️ deferred to PR-2.2
`useSignalingSocket`, dead camera state, `ChametStyleVideoRoom`/`GameRoom`, `Math.random()` in `ShootingStar`, redundant `fetchParticipants()` calls.

### I. WS edge function eviction resilience (P1-7) — ⏭️ deferred
LiveKit already authoritative; ws function is deprecation candidate.

**Verification (owner test):** locked room → password modal retry; viewer join → banner shows within 200ms of LiveKit connect (no more 1-3s gap); seat approve race → no phantom speaker on conflict; long audio room → no AudioContext source leak in DevTools heap.


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