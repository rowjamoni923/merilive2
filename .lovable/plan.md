
# Phase G — Games: Smoothness Audit + Live Win Broadcast

আমাদের 5টা game (Roulette, Teen Patti, Ferris Wheel, Lucky Number, Rocket Race) আছে। দুটো ভিন্ন কাজ একসাথে — performance polish + নতুন "Win Broadcast" feature যা live stream + party room-এর নিচের chat panel-এ welcome message-এর মতো দেখাবে।

কাজ শুরুর আগে research-first protocol অনুযায়ী Chamet/Bigo/Poppo কিভাবে game-win broadcast করে সেটা research করব, তারপর code।

---

## Step 1 — Competitor research (research-first mandatory)
Spawn subagent: Chamet, Bigo, Poppo, Crush Live, HiiClub-এ live room-এ game win কিভাবে broadcast হয় — payload, throttling, anti-spam, animation duration, level/frame display rule। নথিভুক্ত হবে `.lovable/plan.md`-এ।

## Step 2 — Game smoothness audit (per game)
প্রত্যেকটার জন্য:
- Re-render count check (React DevTools profiler logic — useMemo/useCallback gap)
- Animation frame budget (Framer Motion / RAF leaks)
- Realtime subscription duplicate check (round-trip latency)
- Audio preload (gift sound jitter pattern)
- Network: round poll vs realtime gap
- Mobile WebView jank source (heavy SVG/canvas, large gradients)

Output: per-game finding list + targeted fix (no UI redesign — শুধু performance)।

## Step 3 — Win Broadcast feature
### Backend
- নতুন realtime channel: `game-wins-global` (broadcast type, no DB write for per-spin noise)
- Win threshold filter: শুধু `win_amount >= configurable_threshold` (default 1000 diamonds) broadcast — spam কমানোর জন্য
- Per-user 5s cooldown (idempotency)
- Payload: `{user_id, username, level, avatar_frame_url, game_name, win_amount, timestamp}`

### Frontend
- `useGameWinBroadcast` hook — single global subscription, queue manager (max 5 concurrent, FIFO)
- নতুন component `GameWinChatBanner` — exact welcome-message styling সাথে match (একই height, slide animation, mute)
- LiveStream.tsx + PartyRoom.tsx-এর chat panel-এ inject (existing welcome message component-এর পাশে, same render slot)
- Level badge + avatar frame existing user-card system থেকে reuse
- Auto-dismiss 4s; tap = open game

### Where to broadcast from
Each game-এর `finalizeRound` / `settleBet` server function-এ একটা `pg_notify` বা `realtime.send()` add — শুধুমাত্র threshold meet করলে।

## Step 4 — Test (owner account)
Preview-এ login → live stream join → roulette spin → win → অন্য tab-এ live stream-এ banner দেখা যাচ্ছে কিনা check (Playwright + screenshot)।

## Step 5 — Honest deliverable summary
কোনটা server-side (instant), কোনটা APK-rebuild লাগবে — list করব।

---

## Technical notes
- **APK rebuild?** Step 3 pure React + edge function = না। Step 2-এ যদি WebView-specific native tweak (hardware acceleration flag) লাগে = হ্যাঁ, আগেই বলব।
- **Design sacred** — শুধু performance + new banner inject; existing game UI কোনো cosmetic change নয়।
- **English-only UI strings** — banner text English ("WON 5,000 💎 in Roulette")।
- **No fake loading** — banner শুধু real win event এলে show হবে।

---

## What I will NOT do (unless you explicitly say so)
- Game rule/payout change
- New game add
- VPS / LiveKit config touch
- Existing chat panel layout redesign

---

Approve করলে Step 1 (research) দিয়ে শুরু করব, তারপর তোমাকে findings + fix list দেখিয়ে Step 2-এ ঢুকব।
