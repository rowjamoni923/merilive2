# Fix: Instant Close, Instant Join, No Party Password

## Issues
1. **Stale rooms** — Live stream / Party room close করার পরেও Discover-এ "running" দেখায়।
2. **Private call** — দুই পক্ষের যে কেউ cut করলে সাথে সাথে UI থেকে vanish হবে।
3. **Slow join** — Party/Live card-এ click করলে দেরিতে room খোলে, Aviator/game frame আসে না।
4. **Password remove** — Party room-এ password / private toggle সম্পূর্ণ বাদ (all public)।

## Research (industry pattern — Bigo, Chamet, Poppo)
- Realtime presence/heartbeat + `ended_at` server-side stamp; client subscribes to row UPDATE → instant disappear.
- Background watchdog edge function auto-closes rooms with stale heartbeat (>60s) to handle crash/force-kill.
- Card tap → optimistic navigation (no await), room hydrate inside room page using cached row + realtime subscribe.
- No password gating for public party rooms (Chamet/Poppo/Olamet pattern); private mode = invite-only links, not passwords.

## Plan

### A. Instant close (live + party)
- `LiveStream.tsx` / `PartyRoom.tsx` host-side end handler: `update({ is_active:false, ended_at: now() })` BEFORE navigation; on `beforeunload` send same update via `navigator.sendBeacon` to edge function `end-room`.
- `Discover.tsx` + `LiveStreamFeed.tsx`: subscribe to `postgres_changes` UPDATE on `live_streams` / `party_rooms`; when `is_active=false` → splice from list immediately. Also filter initial query by `is_active=true AND ended_at IS NULL`.
- Add edge function `cleanup-stale-rooms` (cron 30s) marking rooms inactive if `last_heartbeat < now()-60s`.
- Host page sends heartbeat every 20s via `update({last_heartbeat: now()})`.

### B. Private call instant vanish
- `private_calls` row: on hangup either side sets `status='ended', ended_at=now()`.
- Both clients already subscribed (per memory: dup subscriptions fixed). Ensure single subscribe path triggers immediate teardown: stop LiveKit room, navigate back, clear incoming-call UI. Add guard so any non-`ringing/active` status forces dismiss.
- `IncomingCallActivity` (Android) — already handled per phase3 memory; no APK change needed here unless we touch native.

### C. Instant join
- Discover card `onClick`: `navigate('/party/:id')` synchronously, no awaits, no modal.
- `PartyRoom.tsx` / `LiveStream.tsx`: render skeleton immediately; fetch room row + LiveKit token in parallel via React Query with `placeholderData` from the list cache.
- Pre-warm LiveKit token: kick off token fetch the moment user taps card (mutation fired in card click handler, result picked up by room page via query cache key `livekit-token:roomId`).
- Re-mount game iframe (Aviator) inside room only after LiveKit connected — but show frame placeholder instantly so user sees game shell.

### D. Remove party password
- `CreateParty.tsx`: remove password input + private toggle UI.
- `PartyRoom.tsx`: remove password prompt / gate.
- DB migration: keep column nullable (backwards-compat) but stop reading/writing. Default `is_private=false` for all new rooms; existing rows untouched.
- Discover: remove "lock" icon / password badge rendering.

## Files (estimated)
- `src/pages/Discover.tsx`, `src/pages/LiveStreamFeed.tsx` — realtime subscribe + filter
- `src/pages/LiveStream.tsx`, `src/pages/PartyRoom.tsx` — end handler + heartbeat + instant render
- `src/pages/CreateParty.tsx` — strip password UI
- `src/hooks/usePrivateCall*.ts` — status-driven teardown
- New edge fn: `supabase/functions/cleanup-stale-rooms/index.ts` + cron
- Migration: ensure `ended_at`, `last_heartbeat` columns exist on `live_streams` + `party_rooms`

## Out of scope
- Native Android changes (no APK rebuild needed)
- LiveKit SFU config
- Game logic itself

Approve করলে এক pass-এ implement করব।
