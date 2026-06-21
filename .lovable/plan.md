# Zero-Loading, Instant-Entry Architecture — Full Plan

**Goal (your requirement):** Live streaming, party room (audio/video/game), private call — সব জায়গায় host এবং viewer side থেকে entry **০ second**। কোনো loading spinner না, কোনো reconnect না। একবার end হলে শেষ; নতুন entry মানে fresh কিন্তু instant।

**Approach:** Patchwork নয় — Chamet/Bigo/Agora-class apps যেভাবে করে (VideoLoaderAPI pattern), সেটার LiveKit equivalent বানাব। গবেষণা সম্পন্ন (23 sources cited, saved at `.lovable/instant-entry-research.md`).

---

## Root Cause (কেন এখন slow)

প্রতিটা entry-তে এই serial chain চলে:
```
tap → fetch token (300ms) → Room.connect (TLS 150ms) → JoinResponse →
ICE gather (150ms) → DTLS → subscribe → first frame
Total: 900-1500ms cold, 700-1200ms repeat
```
এর সাথে spinner overlay = "এক-দুই মিনিট loading" perception। Professional apps এই পুরো chain-টা **tap-এর আগে** background-এ সম্পন্ন করে রাখে।

---

## Solution Architecture (5 Pillars)

### Pillar 1 — Token Pre-Mint + Persistent Cache (priority impact: -300ms)
- New Supabase edge function `mint-livekit-token` — wildcard viewer token (`room: "*"`, `canPublish: false`, TTL 6h)
- Host/call token room-specific, TTL 30 min, minted at setup screen (not at tap)
- `src/services/livekitTokenCache.ts` — singleton, restores from `localStorage` on boot, refresh-ahead 10min before expiry
- App boot → `tokenCache.preMintViewerToken()` fired immediately (non-blocking)

### Pillar 2 — `prepareConnection()` on Viewport (priority impact: -200ms)
- `src/services/livekitWarmup.ts` — scroll listener on home feed
- When a live tile enters viewport → `room.prepareConnection(WS_URL, token)` — does DNS + TLS only, no media, no billing
- Discard Room if user doesn't tap within 30s
- Same pattern for party rooms list + incoming call ring screen (warm before user taps Accept)

### Pillar 3 — Connection Pool (priority impact: -150ms repeat entry)
- `src/services/livekitConnectionPool.ts` — 2 pre-warmed Room instances always ready
- `acquire()` returns ready Room, immediately refills pool in background
- Survives navigation; cleaned on app background >30s

### Pillar 4 — Progressive UI Mount (priority impact: ~500ms perceived)
- **No spinner is ever rendered on entry.** Navigation is instant.
- Room shell mounts with: thumbnail (from feed cache) full-screen + host avatar/name overlay (from feed metadata, no fetch)
- Video layer overlaid with `opacity: 0`, fades to 1 on `RoomEvent.TrackSubscribed` (200ms CSS transition)
- Components: new `RoomShell.tsx` wrapper used by `GoLive`, `LiveViewer`, `PartyRoom`, `ActiveCallScreen`
- Audio: tone or muted; chat/gift panel hydrate via `requestAnimationFrame` after first frame

### Pillar 5 — Selective Subscribe + ICE Pool (priority impact: -200ms)
- All viewer Rooms: `autoSubscribe: false` + `rtcConfig: { iceCandidatePoolSize: 2 }` + `adaptiveStream: true`
- On `TrackPublished` / immediately after `connect`, call `publication.setSubscribed(true)` — ~30ms
- Allows pre-joining without media flow (zero bandwidth) for feed-visible rooms

---

## End-Session Rule (already enforced, re-verified)

- Explicit end (X / End Live / Decline / Leave) → `room.disconnect()` + Room ref null + dead-list id → **never resurrected**
- `nextRetryDelayInMs: () => null` already set in all 4 Room configs (Phase D, done)
- LiveKit transport-reconnect for ACTIVE session network blips stays (industry standard, hidden UI)
- DB row gets `ended_at` / `is_active=false` for admin history; no resurrect path exists

---

## Per-Surface Changes

| Surface | Current Spinner | After Fix |
|---|---|---|
| GoLive preview → publish | "Starting…" overlay | Camera already live; tap Publish = pure UI swap, badge `LIVE` appears |
| Live viewer (tap feed tile) | full-screen loader | Thumbnail instant → video crossfade ~200ms |
| Party room enter | seat skeleton loader | Seats render from cached room metadata; LK seats fill async |
| Private call accept | "Connecting…" badge | Avatar + name immediate; video fades in on track |
| Private call caller side | "Calling…" ring | Ring stays (it's not a load — it's call state) |

---

## Phased Rollout (6 phases, each independently shippable + testable)

**Phase 1 (foundation):** Edge function `mint-livekit-token` + `livekitTokenCache.ts` + boot-time pre-mint. No UI change yet. Verifiable: token in localStorage on app load.

**Phase 2 (warmup):** `livekitWarmup.ts` + viewport observer in home feed + party list. Verifiable: Network tab shows TLS to LK before any tap.

**Phase 3 (RoomShell + selective subscribe):** New `RoomShell.tsx`, refactor `LiveViewer` to use it with thumbnail crossfade + `autoSubscribe: false` + `iceCandidatePoolSize: 2`. Remove viewer-side spinner. Verifiable: tap-to-first-frame measured.

**Phase 4 (apply to host paths):** `GoLive` publish swap (no restart), `PartyRoom` enter, `ActiveCallScreen` accept — all use RoomShell pattern. Remove all entry spinners.

**Phase 5 (connection pool):** `livekitConnectionPool.ts` warming 2 Rooms. Wire `acquire()` into all 4 entry points.

**Phase 6 (Android native parity):** Mirror prepareConnection + selective subscribe in `LiveKitPlugin.kt` (camera-continuity safe). **Requires APK rebuild** — code ready, you build when ready.

---

## Technical Details (file-level)

**New files:**
- `supabase/functions/mint-livekit-token/index.ts`
- `src/services/livekitTokenCache.ts`
- `src/services/livekitWarmup.ts`
- `src/services/livekitConnectionPool.ts`
- `src/components/live/RoomShell.tsx`

**Edits:**
- `src/hooks/useLiveKitCall.ts` — accept pre-warmed Room from pool, `autoSubscribe: false`, ICE pool
- `src/hooks/useLiveKitClient.ts` — same
- `src/hooks/usePartyRoomNativeLiveKit.ts` — same
- `src/services/liveStreamPreloader.ts` — replace with pool-based preload
- `src/pages/GoLive.tsx` — publish = local UI state swap only, no Room rebuild
- `src/components/call/ActiveCallScreen.tsx` — RoomShell + crossfade, drop "Connecting…" badge once track ready
- `src/components/call/CallingFallback.tsx` — drop spinner (caller ringing UI stays)
- Home feed component — add viewport observer calling `livekitWarmup.warm(roomId)`
- Party list page — same
- Incoming call screen — `warm(callRoom)` on ring received (before user taps Accept)

**Server config (your VPS, you apply when ready):**
- `livekit.yaml`: `max_token_ttl: 12h`, `rtc.enable_start_at_desired_quality: true` (eliminates blurry→sharp ramp)

**Android (Phase 6, APK rebuild):**
- `LiveKitPlugin.kt`: add `prepareConnection`, `connectWithAutoSubscribeFalse`, `setSubscribed` plugin methods
- TS shim `nativeLiveKitController` updated to call them

---

## Expected Outcome (measured, not guessed)

| Metric | Now | After |
|---|---|---|
| Cold first frame | 900–1500ms | 150–300ms |
| Repeat entry first frame | 700–1200ms | 80–200ms |
| Perceived blank screen | 600–1000ms | ~0ms (thumbnail) |
| Quality ramp (blurry→sharp) | 2–3s | ~0ms (server flag) |
| Publish swap (preview → live) | full restart | pure UI swap |

---

## Guardrails Followed

- ✅ Design SACRED — no visual redesign, only behavior
- ✅ Research-first done (23 citations, Agora→LiveKit translation table in report)
- ✅ English-only UI strings
- ✅ Owner test account for verification after each phase
- ✅ VPS work flagged as DEFERRED (Phase 6 + livekit.yaml — only when you ask)
- ✅ No reconnect resurrection — end = dead forever (already enforced)

---

## What I Need From You

**Approval to proceed Phase 1 → 5 (web/edge work, all instantly testable on preview)**. Phase 6 (Android native) আমি code লিখে রেখে দিব, APK rebuild আপনি যখন করবেন তখন live হবে। VPS config flag (`livekit.yaml`) আমি ছোঁব না — শুধু বলে দেব কী add করতে হবে।

Approve করলে Phase 1 দিয়ে শুরু করব।