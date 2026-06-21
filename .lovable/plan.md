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

---

## ✅ Poster Photo/Video Upload Fix — 2026-06-21

**User issue:** `/my-poster` upload failed with `new row violates row-level security policy`; profile details also needed every uploaded photo/video visible one after another.

**Research standard:** Chamet/Bigo/Poppo-style profile media uses a public-viewable profile album/carousel with owner-only upload/delete. BIGO cover/profile media guidance emphasizes immediate visual profile media visibility; Chamet profile guidance emphasizes multiple profile photos as discovery/match signals.


**Completed fixes:**
1. `posters` Storage RLS fixed: authenticated owner-only upload/update/delete by first folder segment = `auth.uid()`; broad public object-listing policy removed so users cannot enumerate the bucket.
2. `poster_images` Data API grants fixed: public can read; authenticated users can create/update/delete rows only where `user_id = auth.uid()`; service role retained.
3. Upload supports both `image/*` and `video/*` up to **25MB** in UI; storage bucket already allows **50MB**, so app-side 25MB limit is enforced.
4. `ProfileDetail` now respects `media_type='video'` plus video extensions (`mp4/webm/mov/m4v/ogg`) so signed URLs/public URLs with query strings still render as video.
5. Profile details now shows uploaded media both in the hero slideshow and as a horizontal photo/video strip, so photos/videos appear one after another and are selectable.

**Verified checks:**
- Storage policies for `posters` now exist for owner upload/update/delete; public URL delivery remains through the public bucket without broad object-listing RLS.
- `poster_images` table privileges verified: anon read-only; authenticated read/create/edit/delete; service role all.
- Browser-session upload test could not run in sandbox because no preview auth session env was available, but the exact failing layer was confirmed from console logs as Storage RLS and fixed at DB policy level.

---

## ✅ Referral + Agency Link Audit Plan — 2026-06-21

**Research standard:** Google Play Install Referrer is the Android-supported deferred deep-link channel for referral content through Play Store install; Bigo-style invite rewards commonly unlock larger bonuses only after the referred user becomes qualified through verification/engagement/first purchase; Chamet-style agencies recruit and manage hosts through agency/sub-agent invite links.

**Verified gaps in current app:**
1. `Auth.tsx` still shows a manual referral-code input and incorrectly stores `?ref=` as both invitation and agency referral.
2. `DeepLinkHandler.tsx` deferred link flow also stores invitation `ref` into agency referral storage.
3. `SmartLink.tsx` web landing text still tells users to copy and manually enter a referral/agency code after install.
4. `record_invitation()` marks invites as `verified` immediately on signup; user requirement is to count only after minimum **$2** diamond purchase.
5. Google Play, helper top-up, standard payment approval, and `safe_credit_diamonds()` purchase paths need one shared qualification function so invite counting is consistent.

**Locked fix:**
- User invite link → stores inviter `app_uid` only; creates `user_invitations.status='pending'` at signup; becomes `verified` only after total completed paid purchase amount reaches **$2 USD**.
- Agency link/code → stores agency code only; host signup auto-sends agency join request through `join_agency(..., _joined_via='agency_link')`; invitation links never count as agency.
- Auth page manual referral/agency-code entry removed; Play Store/share pages state automatic link attribution.

---

## ✅ Visitor-Side Live/Party/Private Call Media Audit — 2026-06-21

**User scope:** Only audit/fix visitor-side face/video visibility, join/presence visibility, and minimized/background incoming-call acceptance for Live Streaming, Private Room/Call, and Party Room.

**Research standard:** Chamet/Bigo/Poppo-style apps use SFU participant events for instant join/leave visibility and native Android video surfaces for reliable camera rendering; LiveKit equivalent is `RoomEvent.ParticipantConnected/TrackSubscribed` plus native `TextureViewRenderer` binding. Android call delivery must use high-priority FCM data payload + CallStyle/full-screen intent/Telecom-style accept path, matching WhatsApp/IMO behavior.

**Verified current state:**
1. Live/party/call all use LiveKit, not polling. Supabase tables remain durable presence (`stream_viewers`, `party_room_participants`, `private_calls`).
2. Party native seats already bind per-seat `NativeVideoView` using `nativeParticipants` and `attachRemoteSurface`.
3. Private call native activity already attaches local/remote renderers and FCM path posts high-priority call notification with accept/decline receivers.
4. Gap found: Android live **viewer** native path connected subscribe-only, but `LiveStream.tsx` waited for web `remoteVideoTrack`; native branch only rendered a transparent placeholder. Result: visitor could be connected while host face surface was not deterministically mounted.

**Completed surgical fixes:**
1. `useLiveKitClient` now tracks native remote participants for live sessions, refreshes after connect/reconnect/join/leave, filters hidden/admin identities, and clears state on disconnect/leave.
2. `LiveStream.tsx` now renders `NativeVideoView kind="remote"` for Android live viewers using the host participant SID, so host face is bound through native `TextureViewRenderer` even when no web remote track exists.
3. `LiveKitPlugin.kt` now emits normalized `connection-state` events for Reconnecting/Reconnected and rebinds all native slots after reconnected, so live/party/call native surfaces recover after transient network/app-background transitions.
4. `usePrivateCall` now runs a one-shot foreground-resume pending-call catch-up (not polling) so a minimized WebView cannot miss a pending call created while JS was suspended.
5. `CallProvider` native call-action listener is stable across renders and drains buffered native Accept/Decline actions again on foreground resume, preventing lock-screen action loss during JS remount/resume timing.

**APK note:** Native plugin change requires Android APK rebuild/sync before device verification.
