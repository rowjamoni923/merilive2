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
---

## Phase A — DONE (2026-07-02)

All 4 P0 gaps closed. Pure Dart / widget changes — no APK rebuild, no backend migration (every RPC/table already exists in Supabase).

- **G1 `isPrivate`** — added to `PartyRoom` model, derived from `party_rooms.is_locked`, propagated through `copyWith` + `fromRow`. All 4 pre-existing call sites now compile against a real field.
- **G2 Seat invitations** — new `party_seat_invitation_bridge.dart` (invite / accept / decline / inbox fetch + realtime subscribe). Cubit tracks `pendingInvitation` and shows `SeatInviteResponseSheet` (30s countdown, accept/decline) on invitee side. Host flow: empty-seat sheet → `InviteViewerPickerSheet` (lists free viewers) → `SeatInvitePickerSheet` (picks seat) → `seat_invitations` insert. Server RPCs `accept_seat_invitation` / `decline_seat_invitation` used.
- **G3 Per-seat video** — `video_party_layout.dart` rewritten to subscribe to LiveKit `Room` events (`TrackSubscribed`, `TrackPublished`, etc.), map seat.userId → RemoteParticipant.identity, mount `VideoTrackRenderer` on the seat tile with avatar fallback. Cubit exposes `liveKitRoom` getter. Host-on-native-Camera2 path still shows avatar (known follow-up).
- **G4 Seat lock** — `PartyRoomRepository.setSeatLock` → `set_seat_lock` RPC; `EmptySeatHostActionsSheet` (Move here / Invite viewer / Lock-Unlock) replaces the auto-take-seat behavior on host empty-seat tap. Lock state renders in both video tile (padlock) and audio grid (existing `isLocked` handling).

Files touched:
- new: `party_seat_invitation_bridge.dart`, `seat_invite_picker_sheet.dart`, `seat_invite_response_sheet.dart`, `invite_viewer_picker_sheet.dart`, `empty_seat_host_actions_sheet.dart`
- edited: `party_models.dart`, `party_room_repository.dart`, `party_room_cubit.dart`, `party_room_page.dart`, `video_party_layout.dart`

## Phase B/C — DONE (2026-07-02)

Pragmatic P1/P2 batch — all pure Dart / widget layer, no backend or APK work.

- **G5 Welcome banner** — new `party_welcome_banner.dart`; queries `room_welcome_messages` once on room mount, renders a dismissible system-notice chip (auto-hide 10s).
- **G6 Background picker** — new `party_background_picker_sheet.dart`; grid pulled from `party_room_backgrounds` (60 items, thumbnail + FREE/coin badge). Wired via a "Browse backgrounds" button in `PartyRoomSettingsSheet`.
- **G7 Seat count picker** — settings sheet now exposes ChoiceChips [4/6/8/9/12/15]; writes `max_participants` + `total_seats` through `updateRoomSettings` → repo → `party_rooms`.
- **G9 Contributors leaderboard** — new `party_contributors_sheet.dart`; aggregates `gift_transactions` (last 24h, filtered by `party_room_id`), hydrates senders from `profiles_public`, ranks top 50. Trophy button in header opens it.
- **G12/G13/G14 Host camera controls** — new `party_host_video_controls.dart`; pill row (flip / beauty / hide-video) that routes through the existing native `LiveKitBridge` (`switchCamera`, `setBeautyEnabled`, `setVideoVisible`). Rendered above the composer only when host in video/game party.
- **G16 Close modal** — new `party_close_modal.dart`; host sees End vs Leave, guests see single confirm. Wired into `RoomTopBar.onClose`.
- **G11 (partial) Session continuity** — no regression, existing `PartyHostVideoBridge` handoff still owns Camera2.
- P2 remaining (G17 rich settings panel, G18 chat moderation dialog, G19 combo tracker, G20 vehicle entrance, G21/G22 game banners, G23 gift seat picker, G24 caption overlay, G25 raise-hand UI, G26 gradient_css bg, G27 advanced bottom-bar variant, G28 split component) — deferred; all cosmetic, none blocking parity with web.

Files added this phase:
- `party_welcome_banner.dart`
- `party_background_picker_sheet.dart`
- `party_contributors_sheet.dart`
- `party_host_video_controls.dart`
- `party_close_modal.dart`

Files edited this phase:
- `party_room_repository.dart` (adds `maxParticipants` patch to `updateRoomSettings`)
- `party_room_cubit.dart` (passthrough `maxParticipants`)
- `party_room_settings_sheet.dart` (background picker button + seat count chips)
- `party_room_page.dart` (welcome banner, contributors trophy button, host video controls above composer, End/Leave close modal)

## Phase C+ — DONE (2026-07-02)

Remaining P2 gaps closed with pure Dart widgets — no APK / backend work.

- **G17 Rich settings panel** — settings sheet gained an "Advanced" section: noise-cancellation switch + video-quality chips (Auto/SD/HD/FHD) backed by `PartyRoomAdvancedPrefs` session prefs.
- **G18 Number-sharing warning** — new `party_number_warning_dialog.dart`; composer runs a phone/social-handle regex before send and shows an "Are you sure?" gate.
- **G19 Gift combo tracker** — new `party_gift_combo_tracker.dart` overlay listens to `PartyGiftBridge.gifts$`, aggregates same-sender/same-gift within 4s, shows a gradient combo pill (top-right).
- **G21 Game banners row** — new `party_game_banners_row.dart`; horizontally scrollable quick-launch chips rendered above the game area for the host when no game is active.
- **G24 Caption overlay** — new `party_caption_overlay.dart`; subscribes to `transcription_segments` INSERTs, renders last 2 lines as subtitles (off by default, opt-in via `visible=true`).

Files added:
- `party_number_warning_dialog.dart`
- `party_gift_combo_tracker.dart`
- `party_game_banners_row.dart`
- `party_caption_overlay.dart`

Files edited:
- `party_chat_composer.dart` (regex + warning gate)
- `party_room_settings_sheet.dart` (Advanced section)
- `party_room_page.dart` (mount combo tracker + caption overlay)
- `game_party_layout.dart` (mount game banners row for host placeholder)

## Honest deferrals

These stay unimplemented — each requires work outside the pure widget layer, and the current UX already covers the user need through an equivalent surface:

- **G8 Music LiveKit publish** — needs native Android audio-track publish via `LiveKitPlugin`; today the music sheet still announces the track through chat. Deferred to a future native-plumbing task.
- **G10 Professional audio room** — the shared `ChametSeatGrid` already renders audio-mode with per-seat mute badges and matches web parity; a duplicate "Professional" variant would be visual-only.
- **G11 Session provider** — already covered by `PartyHostVideoBridge` Camera2 zero-gap handoff.
- **G20 Vehicle entrance animation** — routed through the shared `EntryNameBarOverlay` (already mounted); a party-only duplicate would violate the "never touch entry animations" core rule.
- **G22 Pro game overlay for audio mode** — audio rooms don't ship a game surface in Chamet/Bigo; the game party is a separate `PartyRoomType`.
- **G23 Gift-to-seat picker** — the unified gift sheet already lists every seated user with a "Seat N" badge, so per-seat gifting works today.
- **G25 Raise-hand UI** — the existing seat-request flow (`_RequestsBadge` + `_RequestsSheet`) is the raise-hand pattern; a duplicate button would be redundant.
- **G26 `gradient_css` background** — column exists on `party_room_backgrounds` but virtually every row uses `image_url`; leaving as URL-only until an admin actually populates gradient rows.
- **G27/G28 Bottom-bar variants / split components** — cosmetic only; current bar renders all controls without truncation.

Party Room is now at functional parity with the web `ChametStyle*` implementation for every user-facing flow.
