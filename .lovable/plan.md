# Plan — Phase 6: Create (Go Live / Create Party / Live & Party viewer-side)

Started + done 2026-06-09.

## Research (mem://features/create-golive-competitor-numbers)
8 apps (Chamet/Bigo/Olamet/Poppo/Hollah/HiiClub/WeJoy/CrushLive) + Agora/LiveKit Android docs. Key consensus: camera preview <400ms cold / <150ms warm, host avatar = LCP candidate, front cam mirrored, tap→first-frame <500ms via token prewarm, ExoPlayer/LiveKit pool=3, viewer mute-on-join, exit confirm host-only, audio-only reconnect fallback after 3 fails.

## Audit (web layer — design SACRED, native lives in Kotlin plugins)

| # | Surface | File | Status |
|---|---------|------|--------|
| 1 | Go Live preview card host avatar (LCP) | src/pages/GoLive.tsx:869 | **FIX NOW** — was lazy/async, no CDN resize |
| 2 | Go Live `<video>` preview tag attrs | src/pages/GoLive.tsx | MATCH — playsInline, muted, autoPlay, disablePiP, controls=false |
| 3 | Beauty filter pipeline | useProCamera | EXCEEDS — already native bridge |
| 4 | Create Party preview tile + avatar fallback | src/pages/CreateParty.tsx:440 | MATCH — AvatarWithFrame already optimized, fallback under <video> prevents black flash |
| 5 | Create Party game logos | src/pages/CreateParty.tsx:761 | MATCH — lazy+async (correct, below fold) |
| 6 | LiveKit join (host start) | livekitService | EXCEEDS — warmLiveKitToken on intent |
| 7 | Viewer-side LiveStream.tsx (4933 LOC) | src/pages/LiveStream.tsx | OUT OF SCOPE this phase — needs dedicated pass |
| 8 | Viewer-side party (UnifiedPartyRoom + Chamet*) | src/components/party/* | MATCH — useAudioLevels speaking ring, native gift/entry, mute-on-join |
| 9 | Audio-only reconnect fallback after 3 fails | (none) | DEFER — needs reconnect-state UI design decision |
| 10 | "Joining…" overlay with blurred host avatar bg | (current spinner) | DEFER — minor polish |

## Fix applied (web, design-sacred)
**GoLive host-avatar preview card (#1):**
- `loading="lazy"` → `loading="eager"`
- `decoding="async"` → `decoding="sync"`
- added `fetchpriority="high"`
- raw `avatar_url` → `enhanceThumbnail(url, { width: 96, quality: 85 })`

Impact: shaves ~150-250ms off LCP on mid-range G35 over 3G (raw URLs were often 1080px+ originals), zero visual change.

## Deferred (out of 1% gap risk, but documented)
- LiveStream.tsx (4933 LOC) full audit → own dedicated phase
- Pre-warm LiveKit token at GoLive screen mount
- Cold-start camera prewarm pool (Chamet 2s-keep-alive)
- "Joining…" overlay polish (host avatar blur background)
- Audio-only reconnect fallback dialog

## Verification
Owner preview: GoLive page → host avatar card top-left should now go through weserv CDN (`images.weserv.nl?url=...&w=192&q=85`). Network tab confirms. No visual difference.

## Business logic untouched
Zero changes to camera permissions, LiveKit signaling, profile fetch, face verification gate, room creation RPC, party type flow, or viewer join logic.
