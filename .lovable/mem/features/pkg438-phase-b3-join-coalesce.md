---
name: Pkg438 Phase B3 — Welcome chat burst-coalesce
description: 500ms burst-coalesce for welcome chat rows in UnifiedPartyRoom; premium entry animations stay 1:1
type: feature
---
DONE 2026-06-07.

**Goal:** When N viewers join a room within ~500ms (e.g. link share spike), collapse the chat-side rows into a single "Alice and 7 others joined ✨" row — industry pattern (Chamet/BIGO). Premium Entry Effects, Vehicle Entrances, Flying Name Bars stay 1:1 (users paid for those).

**Files:**
- `src/utils/joinMessageCoalescer.ts` — pure helper `createJoinMessageCoalescer({ windowMs, selfUserId, onEmit })` + `formatJoinMessage(out)`. Self-joins bypass the buffer for instant local feedback. userId-dedupe inside the window. Highest-level user picked as "face".
- `src/components/party/UnifiedPartyRoom.tsx` — coalescer ref tied to `currentUserId`, `joinMessages` effect pushes joins into coalescer; leaves stay 1:1.

**Out of scope (intentional):**
- `useEntryAnimations` (full-screen vehicle/entrance/namebar) — untouched.
- `ChametStyleVideoRoom`, `ProfessionalAudioRoom`, `ChametStyleGameRoom` — legacy paths superseded by `UnifiedPartyRoom`. Only update if a user reports duplicate spam there.
- Live stream (`LiveStream.tsx`) — separate path; add same coalescer if needed.
