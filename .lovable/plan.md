# Phase G — Games: Smoothness Audit + Live Win Broadcast

## Research findings (Chamet/Bigo/Poppo/17LIVE) — applied 2026-06-24

### Industry defaults (locked)
- **Broadcast threshold:** ≥ 100 diamonds net gain (≈ $3 USD) — filters trivial wins
- **Per-user cooldown:** 45 seconds (Redis/memory TTL key `win_broadcast:{userId}`)
- **Queue depth:** 10 max in client banner queue
- **Concurrent banners:** 2 max rendered simultaneously
- **Animation duration by tier:** Normal 3s · Big 5s · Mega/Jackpot 8s
- **Color cue:** Blue (P2) → Orange (P1) → **Gold + particle burst** (P0)
- **Slide direction:** Bottom-up for chat row; Left-right for big banner

### Tier model
| Tier | Trigger | Scope | Visual |
|---|---|---|---|
| P2 Normal | < threshold | NO broadcast | — |
| P1 Big Win | ≥ 100 💎 | Room only | Orange pill, 5s, avatar+frame+level+name+amount |
| P0 Mega/Jackpot | ≥ 10,000 💎 or ×50+ multiplier | Room (later: global ticker) | Gold pill + glow + chime, 8s |

### Transport (current Lovable stack)
- DB insert into `stream_chat` / `party_room_messages` with encoded `[GAME_WIN:...]` payload
- Supabase Realtime postgres_changes → client parses → RoomChatOverlay renders
- Future: server-authoritative validation via Supabase RPC + LiveKit RoomService.SendData (anti-cheat)

### Sources
- Chamet Lucky Spin ×3.4–×125 — buffget.com
- Bigo 500-diamond Wishing Pool — news.bittopup.com
- Bigo Dream Castle 15-25s anim — buffget.com
- Bigo clone P0/P1/P2 queue — blog.flv.ink
- LiveKit reliable/lossy data packets — docs.livekit.io
- Supabase Realtime broadcast — supabase.com/docs

---

## Phase progress

### ✅ Step 1 — Research (done)
### ✅ Step 3a — Avatar+frame in win row (delivered)
### 🟡 Step 3b — Threshold + cooldown + tier (in progress now)
### ⏳ Step 2 — Per-game smoothness audit (next)
### ⏳ Step 4 — Owner-account end-to-end test
