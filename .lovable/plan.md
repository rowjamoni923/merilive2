# Multi-Sector Fix Plan — Audit Complete (40 bugs)

৫টা subagent audit-এ মোট 40+ confirmed bug পেলাম। নিচে phased plan। **Phase 1 approve করলে শুরু করব** — পরের phase গুলো এক এক করে শেষ করব।

---

## 🎯 Scope Summary

| Sector | Bugs | Lovable-fix | Need APK | Need DB migration |
|---|---|---|---|---|
| Party Room camera handoff | 6 | ✅ All 6 | ❌ | ❌ |
| Push notification 404 | 2 | ✅ 1 (JS-only) | ⚠️ 1 (cold-start) | ❌ |
| Auth + critical triage | 9 | ✅ 9 | ❌ | ❌ |
| Agency + sub-agency + OTP | 15 | ✅ 13 | ❌ | ✅ 2 (RLS + RPC) |
| Private call billing | 8 | ⚠️ 3 | ❌ | ✅ 5 (cron + RPC) |

---

## 🔥 Phase 1 — Camera + Push + Critical Auth (this round, Lovable-only, no APK, no DB)

### A. Party Room camera handoff (matches LiveStream fix)
6 bugs in `src/hooks/usePartyRoomNativeLiveKit.ts` + `src/lib/nativeLiveKitController.ts`:
1. Add `getPreviewScope()` getter on controller (line 54)
2. Skip second `startLocalPreview` when scope already `'party'` (lines 410-424) → removes 10-20s black flash
3. Fix resolution `720p → 1080p` (line 418 + 1108)
4. Add `publishInFlightRef` guard (lines 586, 994)
5. Remove confusing dead `consumePreparedHostPreviewStream` call in native branch (line 428)

### B. Push notification 404 → inbox (JS-only fix)
1 file change: `src/utils/notificationDeepLink.ts:31`  
`/chat/${conversationId}` (404) → `/chat?user=${senderId}` (opens conversation)  
Cold-start (killed-app) deeplink = Phase 4 (Kotlin).

### C. Critical Auth + Triage bugs
3 critical + 3 high + 3 medium from app-wide triage:
1. **Auth.tsx:1658** — phone OTP login: shadowed `data` discards `verified_token` → use saved `phoneVerifiedToken`
2. **Auth.tsx:1593** — phone OTP: `recordAttempt(false)` unconditional even on success → fix logic
3. **HostApplication.tsx:295** — direct RLS-protected `profiles.update({is_host, host_status})` → switch to existing SECDEF RPC
4. **AuthCallback.tsx:24** — web OAuth hard-blocked → allow web fallback or graceful redirect
5. **Recharge.tsx:1817** — helper-tab submit dead (selectedGateway null check) → relax guard for helper path
6. **Reels.tsx:20** — GiftData type imported from wrong module → unify with `@/features/shared/gifting`
7. **Index.tsx:231** — Following tab silent-empty for unauthenticated → add auth guard with redirect prompt
8. **Settings.tsx:669** — logout missing `clearNativeSession + clearBalanceCache` → add both
9. **AdminAuth.tsx:67** — lockout redirect to `/landing` loops → redirect to `/admin/auth` after delay

### D. Quick agency fixes (route-only, no DB)
- **CreateAgency.tsx:229** — `/agency-dashboard` (404) → `/n-dashboard`
- **BecomeSubAgent.tsx:449** — wrong target → `/create-agency` correct route
- **App.tsx:1267 vs 1355** — duplicate `/create-agency` route → keep session-conditional only

**Phase 1 verification:** TypeScript green + owner test account (smdollarex923@gmail.com) checks login, party room publish, message-tap → inbox.

---

## 🟠 Phase 2 — Agency BLOCKERS + Sub-Agent Wiring (Lovable + 1 DB migration)

5 BLOCKER bugs from agency audit:
- **B1** `BrowserSubAgentForm.tsx:292` — handleSubmit only writes localStorage → wire to `create-sub-agency-browser` edge fn
- **B2** `AgencySignup.tsx:152,320` — `verified_token` discarded → store + pass to RPC; add OTP token consumption
- **B3** `CreateAgency.tsx:114` — zero OTP → add same in-app OTP step
- **B4** `BrowserSubAgentForm.tsx:229` — wrong edge fn → swap `send-app-notification` → `agency-app-otp`
- **B5** `BrowserSubAgentForm.tsx:91,711` — `appVerified` never `true` → wire `setAppVerified(true)` on successful verify

1 DB migration:
- **M1** `sub_agent_commissions` RLS uses `sub_agent_id` (row PK) instead of user_id → fix policy:  
  `USING (auth.uid() IN (SELECT user_id FROM sub_agents WHERE id = sub_agent_id))`

3 minor: code-collision retry loop, sub-agent stats query (replace hardcoded zeros), OTP code prominent rendering in NotificationList.

**Phase 2 verification:** Full agency-create + sub-agent flow end-to-end via owner test account.

---

## 💰 Phase 3 — Private Call Billing (DB migrations + edge function)

2 CRITICAL bugs that may have made billing silently dead:
- **P0** `migrations/20260608013016:31` — cron sends `Authorization: Bearer null` if `app.settings.service_role_key` config absent → switch to `CRON_SECRET` header pattern (edge fn already supports it)
- **P0** `migrations/20260608013016:28` — hardcoded project URL → store in `app_settings` or derive

Plus:
- **P1** `REVOKE EXECUTE` on legacy `deduct_call_coins_per_minute` from `authenticated` → kill double-charge race
- **P2** `get_effective_host_percent()` returns 0 default → return 50 fallback so hosts don't lose gift beans
- **P2** Insert into `coin_transactions` from `bill_call_minute` for finance reporting parity
- **P3** Move `MIN_PREPAY_MINUTES=3` from hardcoded to `app_settings.call_rates.min_prepay_minutes`

**Verification:** Inspect cron logs + run a real call between owner + alt account, watch `billing_ledger` rows + `profiles.coins/beans` deltas.

**NOTE:** Current admin UI already has `AdminCallSettings` + `AdminCommissions` + `AdminPricingHub` that write to `call_rates` + `gift_commission` — that part works ✅. Bugs are in execution pipeline.

---

## 🔧 Phase 4 — APK Rebuild Items (deferred to your next build)

1. **NotificationHelper.java:178** — add `intent.putExtra("route", "/chat?user=" + senderId)` for cold-start deeplink (kills 404 when app was killed)
2. **PrivateCallViewModel.kt** — `attachToCurrentRoom()` initial-sweep of already-subscribed remote tracks (from last turn's audit)
3. Co-Host panel + Screen Share button native mounts (still not exposed in LiveStream)

I'll write the Kotlin/Java code in Lovable; you do `npx cap sync && cd android && ./gradlew assembleDebug`.

---

## Order of Execution

**Approve Phase 1 → I start coding immediately** (all changes are JS, no DB, no breaking design). Then I report back, you verify, we move to Phase 2. Same pattern through Phase 4.

কোনো item বদলাতে চাইলে বা priority shuffle করতে চাইলে বলো। Approve করলে Phase 1 শুরু করছি।

---

## 2026-06-19 — Web Preview blank-screen/click-block emergency pass

**Evidence analyzed:** user videos `Record_2026-06-19-13-40-48...mp4` (20.66s competitor) and `Record_2026-06-19-13-38-22...mp4` (45.59s MeriLive preview). Frame scan confirmed MeriLive preview shows repeated white/blank intervals while competitor keeps a visible camera/room surface.

**Professional standard from competitor/LiveKit research:** Chamet/Bigo-style room transitions keep the camera track/surface alive, change UI overlays only, use skeleton/last-frame fallback during joins, and keep close/message/action controls above media with no invisible tap blockers.

**Code-level fixes applied (web/preview only, Android native path untouched):**
1. `LiveStream.tsx` — button taps no longer bubble into the full-screen tap-to-hide gesture; hidden-UI restore layer is fixed and only restores chrome.
2. `ActiveCallScreen.tsx` — private-call screenshot CSS is scoped to `[data-room-shell="call"]`, so it no longer leaks to Live/Party room videos; web preview call shell always has a dark background instead of transparent/blank.
3. `PartyRoom.tsx` — initial DB-loading state now renders a full party-room skeleton with header, close button, seats, and composer placeholder instead of a plain blank spinner screen.

**Verification signal:** Preview health reports healthy and painting after changes.

---

## 2026-06-19 — Web LiveKit camera render emergency fix

**User evidence:** Android browser preview screenshot shows pre-live camera works, but in-room Live camera is blank; user reports the same camera blank across Live Streaming, Party Room, and Private Call.

**Research applied:** LiveKit JS docs state tracks render through `Track.attach(element)` / `LocalTrack.attach(element)` and expose `mediaStreamTrack` + attached elements; LiveKit React docs recommend rendering actual video tracks via `VideoTrack`. Bigo public materials describe live streaming, video chat rooms, and realtime chat as first-screen camera experiences (500M+ Google Play downloads / 700M+ users in marketing copy), so blank in-room media is below category standard.

**Gap found:** All three flows share `LiveKitVideoPlayer`. The app hid the `<video>` at `opacity:0` until decoded-frame events fired. Chrome/Android WebView can publish a live LocalVideoTrack but miss `loadeddata`/`requestVideoFrameCallback` after attach, causing a permanent blank surface even though preview camera and LiveKit publish succeeded.

**Code-level fixes applied (web/shared LiveKit path):**
1. `LiveKitVideoPlayer.tsx` now verifies LiveKit attach actually placed the expected `MediaStreamTrack` on the element; if not, it explicitly sets `srcObject` to that track.
2. `LiveKitVideoPlayer.tsx` adds a 900ms live-track reveal watchdog so Live/Party/Private Call no longer stay opacity-hidden when the track is live but frame callbacks are missing.
3. `useLiveKitClient.ts` exposes the active web LiveKit room to the existing host camera restart handler and removes the stale `ProCameraEngine.isHeldBy()` recovery block (that engine is currently a no-op stub), so manual recovery can actually republish camera.

---

## 2026-06-19 — Broadcast / Party Broadcast / Private Call camera handoff hardening

**User evidence:** Pre-live preview camera is visible in Lovable mobile preview, but tapping the broadcast/call entry buttons can transition into Live/Party/Private Call with blank video. User explicitly requires the same running preview camera to continue; only UI should change.

**Professional standard applied:** Chamet/Bigo/Agora-style mobile flow keeps camera capture/surface alive from preview → join/connect → in-room UI, publishes after connect using the existing track where possible, and uses renderer attach retries/watchdogs instead of showing blank screens. LiveKit docs confirm the same model: local tracks are created/enabled/published to the room and subscribed tracks must be attached/rendered by the client.

**Code-level fixes applied:**
1. `GoLive.tsx` now treats an inline native-preview retry as the handoff source immediately, so tapping Go Live preserves the running preview instead of falling into the cold native path because React state had not updated yet.
2. `useLiveKitCall.ts` no longer kills prepared call preview before native connect; native retry now uses session-only disconnect so the second attempt promotes the same Camera2 preview track instead of reopening camera.
3. `useLiveKitCall.ts` allows the web/Lovable preview call media path while Android still fails closed to native LiveKit when required.
4. `ActiveCallScreen.tsx` stores the web preview camera as prepared call media, so the LiveKit web call path reuses that same camera stream.
5. `LiveKitPlugin.kt` now reports `attachRemoteSurface` as `attached:false/no_track` until a remote camera track exists, letting `NativeVideoView` retry instead of marking a blank party seat as attached forever.