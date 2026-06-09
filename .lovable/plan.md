# PR-2.5 — Party Room Functional Gaps (Research-Locked)

Implements items 4-10 flagged in the honest audit. All numbers below come from the just-completed competitor research (Chamet/Bigo/Poppo/Tencent TRTC SDK).

## Locked industry numbers

| Feature | Value | Source |
|---|---|---|
| Host reconnect grace | **60s** | TRTC default, Bigo behavior |
| Seat invitation TTL | **30s** | TRTC `applyForSeat(..., 30, ...)` |
| Mute-all | Server-enforced, no self-unmute | Bigo/Poppo |
| Seat lock | Per-seat, 3 flags (taken/audio/video) | TRTC `lock_seat` API |
| Gift split default | Host 60%, speakers split 40% equally | Industry pattern |
| Room search | By room code + country, no age/gender | Bigo/Chamet |
| Entry refund | **None** — preview-before-pay UX | Universal across apps |

## Scope (7 fixes, 1 deliberate skip)

### #4 Host transfer on disconnect
- New column: `party_rooms.host_reconnect_deadline TIMESTAMPTZ`
- Edit `trg_party_host_crash_detection`: instead of closing room, set deadline = `now() + 60s`. Spawn a `pg_cron` job (or rely on next participant event) that, on expiry, promotes lowest-numbered occupied non-host speaker to host (`UPDATE party_rooms SET host_id = ...`, swap roles). If no speakers, close room.
- New RPC `transfer_party_host(p_room_id, p_new_host_id)` for manual transfer button (host-only).
- React: host's own dashboard gets "Transfer Host" item in existing host menu (no new design).

### #5 Mute-all
- New column: `party_room_participants.muted_by_host BOOLEAN DEFAULT false`
- New RPC `mute_all_speakers(p_room_id)` + `unmute_all_speakers(p_room_id)` (host-only, sets flag on all non-host occupied seats).
- LiveKit metadata broadcast on flag change → clients call `setMicrophoneEnabled(false)` and disable the mic toggle button while flag true. No re-request after unmute.
- React: existing host moderation panel gets "Mute All" / "Unmute All" toggle.

### #6 Seat lock (per-seat, TRTC pattern)
- New table `party_room_seat_locks` (room_id, seat_number, is_locked, forbid_audio, forbid_video, locked_by, locked_at).
- RPC `set_seat_lock(p_room_id, p_seat, p_locked, p_forbid_audio, p_forbid_video)` (host-only). Locking an occupied seat first kicks the occupant via existing `kick_from_seat` logic.
- `enter_seat`/`request_seat` RPCs check lock → return `SEAT_LOCKED` error.
- React: empty-seat long-press context menu adds "Lock seat". Locked seat renders existing `Lock` icon overlay.

### #7 Room search by code + country filter (skip add gender/age per research)
- New column: `party_rooms.room_code TEXT UNIQUE` (6-char alphanumeric, auto-generated on create).
- Index: `CREATE INDEX ON party_rooms(room_code)` + full-text on `title`.
- PartyRooms lobby page: add search input (room code or title) + country dropdown filter using existing host country data.

### #8 Per-seat bean attribution edge case
- Fix `seatBeansReceived` aggregation in PartyRoom.tsx: when host equals a former-speaker (post-transfer), use `host_id` from current room state at credit-time, not from the original gift transaction sender path. Add a unit-style assertion in the LiveKit fast-path.
- Implement gift split RPC `record_party_gift_split(p_room_id, p_sender_id, p_total_beans)`:
  - Read `party_rooms.gift_split_config JSONB` (new column, default `{"host_pct":60,"speakers_pct":40}`).
  - Split atomically: host gets host_pct, occupied non-host seats split speakers_pct equally; unoccupied seat shares pool back to host.
  - Writes one row per receiver into `gift_transactions` so existing `seatBeansReceived` aggregation Just Works.

### #9 Seat invitation expiry (30s)
- Add column: `seat_invitations.expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 seconds'`
- Add pg_cron (or recurring edge fn) cleanup: every 60s, `UPDATE seat_invitations SET status='expired' WHERE status='pending' AND expires_at < now()`
- `accept_seat_invitation` RPC: reject if `expires_at < now()`.
- React: existing invitation modal already has a banner — add a 30s countdown ring (Motion `transition.duration: 30`) and auto-close on expiry.

### #10 Entry fee refund grace
- **DECISION: skip the 30s refund I'd previously promised.** Research is unanimous: NO competitor refunds. The professional pattern is preview-before-pay.
- Instead: add a 2-step entry confirmation dialog in PartyRooms lobby card. Step 1 = preview card (host name, topic, current speakers, seat count). Step 2 = "Pay X beans & join" explicit confirm. Coin debit happens only on step-2 tap.
- This matches Chamet/Bigo UX exactly and is the honest professional answer.

## Migration plan (one file)

```text
1. ALTER party_rooms ADD host_reconnect_deadline, room_code, gift_split_config
2. ALTER party_room_participants ADD muted_by_host
3. ALTER seat_invitations ADD expires_at
4. CREATE TABLE party_room_seat_locks (+ GRANT + RLS + policies)
5. Backfill room_code for existing rooms
6. New RPCs: transfer_party_host, mute_all_speakers, unmute_all_speakers,
   set_seat_lock, record_party_gift_split
7. Update trg_party_host_crash_detection to defer-and-promote
8. pg_cron job: expire_stale_seat_invitations every 60s
9. pg_cron job: party_host_reconnect_timeout every 30s
```

## React changes (no design changes, only behavior)

- `src/pages/PartyRoom.tsx` — wire mute-all, seat lock context menu, transfer host menu item, fix seatBeansReceived host edge case, listen to `room_state_changed` for new flags
- `src/pages/PartyRooms.tsx` — search input + country filter + 2-step entry confirm dialog
- `src/components/party/SeatInvitePickerSheet.tsx` — already exists, no change
- New shared util `src/features/party/giftSplit.ts` — pure-function helper, mirrors the RPC for optimistic UI

## Out of scope (deliberate)
- Entry fee refund (research says NO — preview-before-pay instead, which IS in scope)
- Age/gender lobby filter (research: not used on any competitor party-room lobby)
- PartyRoom.tsx split refactor (item #11 from audit — separate PR)
- APK rebuild / device testing (gate-blocked; honest "needs APK" callout at end)

## Verification plan (honest)
- `bunx tsc --noEmit` after each major change
- Supabase linter pass after migration
- Owner account login → /party-rooms lobby smoke (preview is web, gated — I'll get as far as the gate then call out APK-required for in-room flows)
- Mark each item ✅/⚠️ with reason in plan.md

## Estimated touch
- 1 migration (~250 lines SQL)
- ~150 lines added to PartyRoom.tsx
- ~120 lines added to PartyRooms.tsx
- ~80 lines new giftSplit util
- 1 pg_cron pair
