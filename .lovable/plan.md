# Party Room — Full A-to-Z Audit & Fix Plan

Honest audit of every Party Room file in `merilive_app/lib/features/party/` vs. (a) our own web/React implementation and (b) Chamet / Bigo / Yalla / Poppo / Olamet professional standard.

---

## Current State (what already works)

**Discovery & entry** — 100% ✅ (tabs, country strip, search, code-join, realtime, preview sheet, room card)
**Create party** — 95% ✅ (mode select, game picker, camera preview, beauty, entry fee, RPC)
**Chat** — 90% ✅ (composer, quick emoji, realtime, system messages)
**Gifts** — 80% ✅ (unified sheet, VAP/SVGA native, realtime)
**Game party** — 90% ✅ (WebView overlay, game picker)
**Seat CRUD** — 80% ✅ (take/leave/request/approve/deny/mute/kick/ban/mute-all)
**Host video publish** — 100% ✅ (Camera2 zero-gap handoff via native LiveKit)

## Room Categories


| Type              | Flutter                                                | Web |
| ----------------- | ------------------------------------------------------ | --- |
| Audio-only party  | ✅ (uses generic seat grid, no `ProfessionalAudioRoom`) | ✅   |
| Video multi-guest | ⚠️ (no per-seat video tiles)                           | ✅   |
| Game party        | ✅                                                      | ✅   |


---

## Gap List (28 items · 4 P0 · 11 P1 · 13 P2)

### 🔴 P0 — Blockers / broken


| #      | Gap                                                                                                                                                                                                            | Why it's P0                                                                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **G1** | `PartyRoom.isPrivate` referenced in 4 files but field **doesn't exist** in the model — always evaluates falsy, silently breaks lock badge and private-room join logic                                          | Latent bug across the whole feature                                        |
| **G2** | **Seat invitation system entirely missing** — `seat_invitations` table, `accept_seat_invitation` / `decline_seat_invitation` RPCs, invite picker sheet, response sheet, inbox listener — none exist in Flutter | Chamet/Bigo core UX; without it host has no way to pull specific viewer up |
| **G3** | **Per-seat video tiles missing** in video party — `video_party_layout.dart` renders only the seat grid, no `LiveKitVideoPlayer` per seat → video party mode shows blank tiles                                  | Video party is unusable                                                    |
| **G4** | `**set_seat_lock` RPC never called** — Flutter reads lock state but host cannot lock/unlock individual seats; no `EmptySeatHostActionsSheet`                                                                   | Core moderation control                                                    |


### 🟡 P1 — Feature parity gaps


| #   | Gap                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------- |
| G5  | `RoomWelcomeBanner` — `room_welcome_messages` table never queried; no banner shown on join                       |
| G6  | `BackgroundPickerPanel` — `party_room_backgrounds` table never queried; host can only paste raw URL              |
| G7  | Seat count / layout picker (`SeatSelectorPanel`, `LayoutPickerPanel`) — no way to change `active_seats` mid-room |
| G8  | Music actual playback — sheet only announces track name; no LiveKit publish of audio track                       |
| G9  | Gift contributors leaderboard panel (top senders + host commission)                                              |
| G10 | `ProfessionalAudioRoom` / `ProfessionalSeatGrid` / `ProfessionalBottomBar` — dedicated audio-mode UI             |
| G11 | `PartySessionProvider` — camera preview preserved across Create→Room without native teardown                     |
| G12 | Host **beauty filter** toggle inside room (exists only in GoLive)                                                |
| G13 | Host **camera flip** button inside room                                                                          |
| G14 | Host **video hide** toggle (`isVideoOff`) in video party                                                         |
| G15 | `EmptySeatHostActionsSheet` — Lock / Unlock / Move-here on empty seat tap                                        |


### ⚪ P2 — Polish / niche

G16 `ChametStyleCloseModal` (End vs Leave) · G17 rich `ChametStyleSettingsPanel` (noise cancel, video quality) · G18 chat content moderation + `NumberSharingWarningDialog` · G19 `GiftComboTracker` overlay · G20 `VehicleEntranceAnimation` · G21 `ChametStyleGameBanners` · G22 `ProfessionalGameOverlay` (audio-mode game) · G23 `PartyGiftSeatPicker` (gift to specific seat #) · G24 `CaptionOverlay` · G25 `PartyRaiseHandUI` · G26 `gradient_css` read from bg table · G27 `AdvancedPartyBottomBar` variant · G28 `PartyRoomBottomBar` split component

---

## Fix Order (implementation phases)

```text
Phase A (this task, P0, ~1 pass)
  A1. Add `isPrivate` field to PartyRoom model + repository mapping
  A2. Seat invitation system:
        - New file: data/party_seat_invitation_bridge.dart
        - New file: widgets/seat_invite_picker_sheet.dart (host)
        - New file: widgets/seat_invite_response_sheet.dart (viewer)
        - Realtime inbox subscription in party_room_cubit
        - Wire "Invite to seat" action on empty-seat tap (host)
  A3. Per-seat video tiles in video_party_layout.dart
        - Subscribe to LiveKit RemoteVideoTrack per seat uid
        - Render VideoTrackRenderer inside each seat tile
  A4. Empty-seat host actions:
        - New file: widgets/empty_seat_host_actions_sheet.dart
        - Options: Lock/Unlock (calls set_seat_lock RPC) · Invite viewer
        - Add setSeatLock() to party_room_repository.dart

Phase B (next task, P1 batch)
  G5, G6, G8, G10, G12–G15 in one pass — all cosmetic/UX additions
  G7, G9, G11 in a follow-up pass

Phase C (later, P2 polish)
  G16–G28 batched as time permits
```

---

## Technical Notes

- **Zero backend work needed** — every table, column, RPC (`accept_seat_invitation`, `decline_seat_invitation`, `set_seat_lock`) already exists in Supabase. Flutter is purely catching up to web.
- **APK rebuild**: NOT needed for Phase A. All changes are pure Dart / widget layer.
- **LiveKit pattern for per-seat video** (G3): subscribe to `RemoteParticipant` by identity == seat.userId, filter for `TrackSource.Camera`, mount `VideoTrack.attachTo()` renderer inside seat tile. No native plugin change — existing `party_livekit_service.dart` already exposes track events.
- **Research citations** (Chamet/Bigo/Yalla/Poppo/Agora seat-manager reference + LiveKit RoomServiceClient docs) saved for follow-up: seat state machine EMPTY/LOCKED/OCCUPIED/MUTED/SPEAKING/PENDING is universal; atomic seat writes via server-authoritative metadata is the standard pattern — we already have this via Supabase row + realtime, so no rearchitecture.
- **Design sacred**: no visual redesign — only wiring missing widgets that mirror existing web components 1:1.

---

## Deliverable of Phase A

4 P0 fixes in one implementation pass. After it lands:

- Party room private-mode flag works end-to-end
- Host can invite specific viewer to a specific seat with accept/decline UX
- Video party mode actually shows video per seat
- Host can lock / unlock individual seats + tap-empty-seat action menu

Party Room will match web at feature-parity for all critical flows; only cosmetic / niche gaps (P1/P2) remain for follow-up passes.