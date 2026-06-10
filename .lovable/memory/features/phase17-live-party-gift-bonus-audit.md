---
name: Phase 17 — Live/Party/Gift/Bonus deep audit + fixes
description: Honest gap audit & fixes for host face render, public chat, entry animations, gift combo counter, new-host 5h bonus, and party-type parity. 8-app competitor research-backed.
type: feature
---

# Phase 17 — Honesty audit (live/party/chat/gift combo/new-host bonus)

Date: 2026-06-10. Triggered by owner explicit request "honesty এর সাথে scan কর". Research-first rule applied.

## Competitor numbers (locked, with citations)

| Topic | Industry value | Source |
|---|---|---|
| First-frame target | ≤1 000 ms good network | docs.agora.io optimize-frame-rendering |
| `autoSubscribe: false` then `setEnabled(true)` after `TrackPublished` | LiveKit equivalent of Agora `autoSubscribeVideo=false` | docs.livekit.io/transport/media/subscribe |
| Chat slow-mode | Redis per-user `{userId}:{roomId}` last_sent_ms | Whatnot Engineering blog |
| Chat char cap | 100-200 chars typical (live), 5000 max (stream.io default) | industry consensus |
| Room broadcast QPS | 10 msg/sec per AppID (ZEGOCLOUD) | zegocloud.com/blog/virtual-gifts |
| Welcome dedup window | 30 s (Bigo uses 60 s low-tier networks) | inferred from Agora RTM presence pattern |
| Welcome row | broadcast system row in chat (NOT local-only); separate from fullscreen entry effect | Chamet/Bigo teardowns |
| Entry effect priority queue cap | 5 items; premium > standard > none; 1 fullscreen at a time | TRTC TUILiveKit |
| Entry SVGA duration | 3-5 s standard / 5-7 s premium fullscreen | 17ae.com SVGA marketplace |
| **Gift combo timeout** | **3-5 s after last send** (4 s sweet spot) | myliveroom.com combo article, Android CustomGiftView teardown |
| Gift combo lanes | Max 3-4 per sender, vertical right-edge stack | App teardowns |
| Gift combo rubber-band bounce | scale 1.0→1.4→1.0 over ~200 ms | programmersought CustomGiftView teardown |
| Combo fullscreen suppression | Premium SVGA plays ONCE on first send; subsequent sends only increment edge counter | Chamet/Bigo pattern |
| New host bonus enforcement | Server-side stream accumulator + active-mic + min-viewer + non-overlap + 30-min session min + 48h bean hold | bittopup.com BIGO 2026 host program |
| Tap target | 48 dp Android / 44 pt iOS | support.google.com/accessibility |
| Inline button loading | spinner replaces label, fixed width (no layout shift) | Stream Video Android StreamButton.kt |
| Double-tap debounce | 500 ms UI / 2 s monetary | react-native-press-guard |

## Audit findings (honest)

### ✅ Already correct
- Host video render: 6-burst retry (0-1150 ms) + 60 s watchdog every 4 s, `retrySubscription` defined at `useLiveKitClient.ts:1552` and exported L2079 (NOT undefined — earlier suspicion debunked).
- Chat realtime fanout: LiveKit DataPacket fast-path + Supabase `postgres_changes` safety-net + `seenMsgIds` Set dedup.
- Entry animation broadcast: LiveKit DataPacket + Postgres `stream_viewers` 1500 ms safety-net.
- Mirror policy: local host mirrored, remote viewer non-mirrored.
- **New host 5h/24h bonus RPC `record_host_live_minute`**: server validates `live_streams.is_active=true AND last_heartbeat > now()-3 min`, **58 s tightened tick guard prevents 50 s spoof**, saturating `LEAST(minutes_accumulated+1, target)`, `program_day` via `get_task_program_day` (rolling program window, not raw 24h), `auth.uid()==_host_id` enforced, `claim_host_live_hour_bonus` re-verifies `is_host && host_status='approved' && is_face_verified`. **Spoof-resistant.**
- Format support for entry animations: SVGA/VAP/PAG/Lottie/MP4/WebM/GIF via `EntryAnimationFrame`.

### 🔴 Real gaps fixed in this phase

| # | Gap | File:line | Fix |
|---|---|---|---|
| 1 | **`GiftComboDisplay` was 100% dead code** — never imported anywhere. 10 gifts = 10 stacked flying animations. | LiveStream.tsx, party rooms | Created `GiftComboTracker.tsx` — listens to `livekit-gift-sent`, maintains per-`(senderId,giftName)` lanes, 4 s window, max 3 lanes vertical right-edge stack. Mounted in LiveStream + UnifiedPartyRoom + ChametStyleGameRoom. |
| 2 | Chat send no `disabled` state — double-tap = duplicate INSERT | LiveStream.tsx:2420 | Added `isSendingRef` guard at top, reset on completion. |
| 3 | Contact masking only when `is_host===true` — viewers passed unmasked even on violation | LiveStream.tsx:2431 | Removed host-only gate; mask applies to ALL users with violations. |
| 4 | No user feedback on chat INSERT failure | LiveStream.tsx:2475 | Added `toast.error("Message failed to send")`. |
| 5 | Entry animation no mount guard before self `addEntryAnimation` | LiveStream.tsx:1254 | Wrapped in `if (mountedRef.current && ...)`. |
| 6 | Entry effect fires emoji particle even when user has NO equipped animation (noisy) | LiveStream.tsx:1254 | Gated on `(entranceAnimationUrl \|\| entryNameBarUrl \|\| vehicleAnimationUrl \|\| rankCode)`. |
| 7 | Video reveal watchdog (450 ms) revealed black frame without decoded-frame check | LiveKitVideoPlayer.tsx:208 | Added `el.readyState >= 2 && el.videoWidth > 0` guard before `markReady()`. |

### 🟡 Deferred (require deeper UX call or APK rebuild)

| # | Item | Reason |
|---|---|---|
| D1 | Suppress fullscreen SVGA re-play for combo sends (industry: fullscreen once, counter for subsequent) | Needs sender-side debounce logic + product approval. Combo counter now visible — visual UX already vastly improved. |
| D2 | Slow-mode countdown UI in chat input | No `slow_mode_seconds` field in DB schema yet; needs server feature. |
| D3 | Welcome dedup 30 s rejoin guard | Server-side check on `stream_viewers` re-INSERT. |
| D4 | New host bonus extra anti-cheat (active mic + min viewers + non-overlap) | Bigo-style hardening; requires multi-table joins in RPC. Current spoof-resistance is reasonable for our scale. |
| D5 | Game-party gift/entry parity deep-audit | `ChametStyleGameRoom` shares `useRoomGifts` shell + now `GiftComboTracker` — visible combo parity achieved. Full feature parity audit pending. |
| D6 | Bonus claim button inline spinner | Cosmetic; `claimingHour` already disables re-entry. |
| D7 | Bottom bar overflow on Helio G35 (~360 px) when all action buttons visible | Needs `flex-wrap` or `overflow-hidden` test on real device. |

## Files changed
- **NEW** `src/components/live/GiftComboTracker.tsx`
- `src/pages/LiveStream.tsx` (5 fixes + GiftComboTracker import/mount)
- `src/components/party/UnifiedPartyRoom.tsx` (GiftComboTracker mount)
- `src/components/party/ChametStyleGameRoom.tsx` (GiftComboTracker mount)
- `src/components/live/LiveKitVideoPlayer.tsx` (frame-guard fix)

## Test plan (owner account)
1. Login `smdollarex923@gmail.com` / `Sazzad017@`
2. Go live as host → confirm host face shows for viewers (no black frame on slow network thanks to V3 fix).
3. Send a rapid 5x of same gift → confirm edge-right combo counter appears with "x5" + rubber-band bounce (previously: 5 stacked flying gifts only, no counter).
4. Send chat double-tap → confirm only 1 row inserted, button no longer races.
5. Try sending phone number `+8801712345678` → confirm masked for viewer accounts too (previously bypassed).
6. Disconnect mid-send → confirm "Message failed to send" toast.
7. Join with no equipped entry animation → confirm NO full-screen emoji particle fires.
8. Repeat in audio + video + game party rooms → combo counter visible in all three.

## Open verification (need real testing, can't be Lovable-only)
- Actual host stream 30 + min → claim bonus → confirm beans credited (server flow already verified by SQL inspection).
- Combo counter across 3-4 simultaneous senders in real room — visual stack should not overlap chat/gifts.
- Video reveal frame-guard on real 3G Helio G35.
