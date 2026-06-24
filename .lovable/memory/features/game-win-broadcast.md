---
name: Game-Win Broadcast (Chat Panel)
description: Industry-standard threshold/cooldown/tier defaults for in-room game-win banners, plus payload format + render path. Applied 2026-06-24.
type: feature
---

## Standards (locked, from Chamet/Bigo/Poppo research)
- **Threshold:** `BIG_WIN_THRESHOLD = 100 💎`. Wins below this NEVER broadcast (player still sees their own popup).
- **Cooldown:** 45s per-user (memory map, key=userId). Prevents spin-spam.
- **Mega tier:** `MEGA_WIN_THRESHOLD = 10_000 💎`. Future: global ticker + chime.
- **Max concurrent banners:** 2 (P0/P1 priority eviction) — future.
- **FIFO queue depth:** 10 — future.

## Payload (encoded in chat row)
Format v3: `[GAME_WIN:emoji:gameName:amount:userName:level:userId:avatarUrl]`
Back-compat: v2 (no userId/avatar), v1 (no userName/level). Parser in
`src/services/gameWinNotificationService.ts` + `src/features/shared/room/RoomChatOverlay.tsx`.

## Render
`RoomChatOverlay` parses the encoded message and renders entry-banner style:
- `AvatarWithFrame` (xs, showFrame=true, animation if level≥10) — purchased frame shows live
- Level badge + winner username (gold + glow)
- "won {amount} 💎 in {gameName}!"
- Animated game logo (Admin Panel) + diamond emoji
- Gold gradient pill background

## Where wins fire
`LiveGameBoard.handleGameWin` is the single entry point. All 5 games
(Roulette, Teen Patti, Ferris Wheel, Lucky Number, Rocket Race) call
`onGameWin(totalWinnings)` from their own settle logic → handler →
`sendGameWinNotification`. Guards (threshold + cooldown) live inside the
service so per-game changes aren't needed.

## What NOT to do
- Don't lower threshold below 100 without explicit user approval (spam complaints).
- Don't remove cooldown — users will rage about chat being flooded.
- Don't change the encoded payload format without bumping the version
  AND keeping v1/v2 parsers (old messages persist in DB history).
