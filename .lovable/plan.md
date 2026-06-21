# Admin Panel Professional Audit + Fix Plan

**Locked:** 2026-06-21
**Approach:** Research-validated (Bigo/Chamet/Poppo/Olamet/MICO/Hollah patterns). Surgical fixes only — 154 admin pages-এর 90% already professional, শুধু 4 specific gaps fix হবে।

---

## 🔒 Invariant: Admin Monitoring 100% Invisible to Users

**Locked behavior (industry standard, Bigo/Chamet/Agora SDK pattern):**
1. Admin join LiveKit with `hidden=true` flag → other participants এর কাছে `ParticipantConnected` event fire হবে না
2. Admin identity prefix `admin-{role}-{uuid}` → server filters before any client-visible event
3. Admin NEVER inserts row into `stream_viewers`, `party_room_participants`, `call_events` (participant tables)
4. Admin NEVER triggers `viewer_joined` broadcast, entrance animation, chat join notice, gift permission grant
5. Admin token = `canSubscribe=true, canPublish=false, canPublishData=false` → cannot send any signal that user side renders
6. `viewer_count` calculations exclude admin identities (both LiveKit-side ParticipantConnected counter + Postgres `stream_viewers` row count are clean)

**Current verified state:**
- ✅ `livekit-token` edge fn (lines 91-101, 274-345): admin token → `hide=true` always, identity `admin-{role}-{uuid8}`
- ✅ `AdminStreamViewer.tsx` (line 30): identity `admin-monitor-{ts}`, no stream_viewers write, no chat send, no gift, audio starts muted
- ✅ LiveKit SFU honors `hidden=true` → SFU strips the participant from `ParticipantConnected/Disconnected` notifications to other participants

**Gap to fix in Phase 1+2:** Same invariant must hold for party rooms (`party_room_*` tables) and private calls (`private_calls`, `call_events`).

---

## 📋 Audit Result (evidence-based, file-line cited)

| # | Capability | File | Status |
|---|---|---|---|
| 1 | Live stream admin viewer | `AdminStreams.tsx:624,726` + `AdminStreamViewer.tsx` | ✅ Built, invisible |
| 2 | LiveKit Rooms dashboard | `AdminLiveKitRooms.tsx` | ✅ Read-only OK, ⚠️ no per-room watch button |
| 3 | Auto recording infra | `livekit-auto-record/index.ts` + R2/Supabase storage fallback | ✅ Built, ❌ disabled |
| 4 | Manual recording | `livekit-egress/`, `livekit-stream-egress/`, `livekit-track-egress/`, `livekit-hls-egress/` | ✅ |
| 5 | Recording playback/download | `AdminRecordings.tsx` (512 lines) | ✅ |
| 6 | Moderation (kick/mute/ban) | `AdminModeration.tsx`, `livekit-moderate/` | ✅ |
| 7 | Face verification | `AdminFaceVerification.tsx` (1566 lines) | ✅ |
| 8 | Webhook events | `livekit-webhook/`, `livekit-webhook-events-ops/` | ✅ |
| 9 | Cost monitor | `AdminCostMonitor.tsx` | ✅ |
| 10 | Party Room admin watch | `AdminPartyRooms.tsx:336` | ❌ Eye only opens detail dialog |
| 11 | Private Call admin watch | `AdminTodayCalls.tsx` | ❌ No monitor UI at all |
| 12 | Auto-record default | migration `20260525214856` line 31-32 | ❌ `auto_record_live=false` for all approved hosts |

---

## 🎯 Fix Plan — 4 Phases

### Phase 1 — Party Room Invisible Admin Monitor
**Files:** `src/pages/admin/AdminPartyRooms.tsx`
- Add "Watch Room" button next to existing Eye button
- On click → open `AdminStreamViewer` modal with `roomName=party_{room_id}`
- `AdminStreamViewer` already invisible — same component handles party scope
- Test: open party room as user → admin watches → user side participant count, seat list, chat join notice **must show zero change**

### Phase 2 — Private Call Invisible Admin Monitor
**Files:** `src/pages/admin/AdminTodayCalls.tsx`, `src/components/admin/AdminCallMonitor.tsx` (new)
- New `AdminCallMonitor` component (clone of `AdminStreamViewer` adapted for call scope):
  - `roomName=call_{call_id}`
  - Subscribe to both caller + callee video/audio tracks (2 video tiles side-by-side)
  - Admin token always `hidden=true`, identity `admin-call-monitor-{ts}`
- In `AdminTodayCalls.tsx`, only show "Monitor" button when `status='active'`
- **E2EE guard:** if `private_calls.e2ee_enabled=true` → button disabled, show "End-to-end encrypted — metadata only" badge (security correctness, matches Signal/WhatsApp model)
- Test: active call between 2 users → admin monitor opens → both users see no notification, call_events table no admin row

### Phase 3 — Auto-record Default ON (industry standard)
**Migration:**
```sql
-- 1. Change column default
ALTER TABLE public.profiles ALTER COLUMN auto_record_live SET DEFAULT true;

-- 2. Backfill all approved/face-verified hosts
UPDATE public.profiles
SET auto_record_live = true
WHERE host_status = 'approved'
  AND is_face_verified = true
  AND auto_record_live = false;
```
**Admin UI:**
- `AdminFaceVerification.tsx` host detail panel → add toggle row (re-use existing `AutoRecordSettingsRow` component)
- `AdminStreams.tsx` → bulk action: "Enable recording for all approved hosts"
**Test:** new host approve → row default true → host goes live → `livekit-auto-record` trigger fires → `stream_recordings` row created → AdminRecordings shows playback

### Phase 4 — AdminLiveKitRooms Per-Room Quick-Watch
**Files:** `src/pages/admin/AdminLiveKitRooms.tsx`
- Per-room "Watch" button in rooms list
- Route by `scopeOfRoom()` (already exists):
  - `live` → `AdminStreamViewer`
  - `party` → `AdminStreamViewer` with party params
  - `call` → `AdminCallMonitor` (from Phase 2)
- Single entry point for "see any room in real time"

---

## ✋ NOT touching (already professional)

- LiveKit SFU infra (VPS-side, deferred per rule)
- R2 + Supabase Storage dual-fallback (working, both kept per user instruction)
- AdminRecordings playback / download / expiry
- `livekit-moderate`, `livekit-auto-moderator`, `live-voice-moderate`, `live-face-warnings`
- Face verification flow (1566 lines, separate scope)
- Recording webhook → DB write pipeline
- All other 144 admin pages (agencies, finance, gifts, vips, etc.)
- App-side live/party/call user experience (zero user-facing changes)

---

## ✅ Verification Gates (all must pass per phase)

| Gate | How verified |
|---|---|
| G1: User sees zero admin signal | Open page in 2nd browser as user → admin monitors → screenshot user side → participant list, viewer_count, seat count, chat notice all unchanged |
| G2: DB clean | `SELECT * FROM stream_viewers WHERE participant_identity LIKE 'admin-%'` → 0 rows. Same for party_room_participants, call_events |
| G3: viewer_count unchanged | `live_streams.viewer_count` before/after admin watch → equal |
| G4: Recording fires | New live → wait 5s → `stream_recordings` row + `egress_id` populated |
| G5: Playback works | AdminRecordings → click play → MP4 streams |
| G6: E2EE call respected | Call with e2ee_enabled=true → admin monitor button disabled |
| G7: No regression | Existing AdminStreams live viewer still works post-Phase-4 |

---

## Owner Test Recipe (smdollarex923@gmail.com)

After all 4 phases:
1. Login owner → Go Live → keep live
2. Open 2nd browser/incognito → join as viewer → note participant count = 1
3. Open admin panel → AdminStreams → Watch → admin sees host camera
4. Switch to viewer browser → count still 1, no "admin joined" toast, chat empty
5. End live → AdminRecordings → new recording listed with MP4 playback
6. Repeat for party room (Phase 1) and private call (Phase 2)
