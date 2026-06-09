# PK R6 — Random Match Race Fix (Pragmatic Hardening)

## Research summary (verified)

| Concern | Industry standard (Tencent / ZEGO / Chamet / Bigo / Poppo) | Our current | Verdict |
|---|---|---|---|
| Acceptor invite countdown | 10–30s (Tencent BattleStore `timeout:30`, ZEGO 1–600s) | 20s UI | OK, tighten to 15s |
| Post-accept settle window | Server-authoritative state machine (atomic `UPDATE ... WHERE status='invited' RETURNING`) | 6 × 600ms = 3.6s poll, silent fail | **Broken** |
| Losing acceptors when first wins | Push `onBattleRequestCancelled` / row-status push → overlay auto-dismisses | **Nothing** — others stuck 20s | **Broken** |
| Requester feedback on zero accept | `onBattleRequestTimeout` callback → toast | Silent `pendingRandomRef=false` after 25s | **Broken** |
| Requester cancel | Universal first-class API (every SDK) | None | Missing |
| Eligibility filter | Active stream + level + region + recent-opponent + not-already-in-PK | Only `is_active + gender=female` | Weak |
| Race prevention | Atomic DB claim (Postgres `UPDATE...RETURNING`, Redis `SETNX`) | Boolean ref `pendingRandomRef` — client-side only | Weak but works for first-wins |

Sources: Tencent TUI/BattleStore docs, ZEGOCLOUD PK Battles docs, Redis official matchmaking tutorial (Mar 2026), Chamet/Poppo/Bigo guides (bittopup, enjoygm), TikTok LIVE Match. Full citations in research log.

Architectural note: industry standard for *random* PK is **pool-based** (both hosts opt-in, server pairs). Our current is **broadcast-invite-based**. Full pool rebuild is a Phase R6b project — for now we harden the existing broadcast model so it stops silently breaking.

## Scope of this phase (R6a)

Six surgical fixes — pure Lovable code (edge fn + React), no APK rebuild, no schema change.

### Fix 1 — Atomic server-side claim (kill the 3.6s poll)
- **Today**: acceptor sends `random_accept` FCM → challenger receives event → challenger calls `start_pk_battle_random` RPC → acceptor polls `pk_battles` for 3.6s hoping the row appears.
- **New**: in `pk-invite-deliver` `random_accept` kind, do the RPC server-side using service role on behalf of the *challenger* (after verifying the original challenger is still in their stream). Insert the battle row, *then* push `pk_random_accepted` FCM with `battleId` already populated. Acceptor doesn't need to poll — battleId arrives in the push payload.
- Both sides switch to the existing `pk_battles` Realtime sub (already used by `useNotifications`) to drive UI.

### Fix 2 — First-wins atomic gate
- Add a unique partial index / advisory lock in `pk-invite-deliver` `random_accept`: only the **first** acceptor's request creates a battle; subsequent acceptors get `{ ok: false, reason: 'taken' }` synchronously.
- Use Postgres advisory lock keyed on `hash(challenger_id)` — no schema migration needed.

### Fix 3 — Notify losing acceptors
- When a `random_accept` wins, `pk-invite-deliver` fans out a `pk_random_taken` notification to all *other* hosts that received the original `random_invite` (track via `notifications.data.invite_session_id` set on the random_invite fan-out).
- Acceptors receive `pk-notification` event with `type === 'pk_random_taken'` → dismiss `PKRandomMatchNotification` + toast "Match taken by another host".

### Fix 4 — Requester feedback on no accept
- Challenger-side: when `pendingRandomRef` 25s timer expires with no accept, show toast "No host accepted — try again" (today: silent).

### Fix 5 — Requester cancel button
- Add small "Cancel" button on challenger-side waiting state inside `PKBattlePanel` (currently the panel closes immediately on send — change to keep an inline "Searching… [Cancel]" pill).
- Cancel calls new `pk-invite-deliver` kind `random_cancel` → fans out `pk_random_cancelled` to all original recipients → their notifications dismiss with toast "Host cancelled the request".

### Fix 6 — Eligibility filter
- In `pk-invite-deliver` `random_invite`, exclude hosts who are:
  - currently in `pk_battles` with `status IN ('invited','accepted','live')`
  - recipient of a `pk_random_invite` notification in the last 30s (cooldown to prevent spam)
- Also tighten countdown UI 20s → 15s to match industry median.

## Files

**Edited**
- `supabase/functions/pk-invite-deliver/index.ts` — Fix 1, 2, 3, 5, 6 (new kinds: `random_cancel`; server-side battle creation in `random_accept`; advisory lock; fan-out filters; `invite_session_id` tagging)
- `src/pages/LiveStream.tsx` — Fix 1 (remove 3.6s poll, use battleId from push payload); Fix 3 (`pk_random_taken` handler dismisses notification)
- `src/components/live/PKBattlePanel.tsx` — Fix 4 (no-accept toast); Fix 5 (cancel button + `random_cancel` invoke); update pendingRandomRef to store `invite_session_id`
- `src/components/live/PKRandomMatchNotification.tsx` — countdown 20→15s

**New**
- (none — all DB work uses existing tables + advisory locks)

## Out of scope (deferred R6b)
- Pool-based opt-in matchmaking (both hosts press "Find Opponent", server pairs)
- Level-bucket / region matching
- Recent-opponent 30-min blacklist table
- Sequential auto-retry up to 3 attempts
- Decline-rate metric for pool ranking

These are the bigger architectural shift. R6a fixes the bleeding; R6b is the rebuild.

## Verification
- Owner test account: create PK request from one stream, accept from second account, confirm battle starts without 3.6s gap.
- Two-acceptor race: open three preview tabs (1 challenger + 2 hosts), confirm second acceptor sees "Match taken" toast.
- No-accept timeout: send random invite to empty pool, confirm "No host accepted" toast after 25s.
- Cancel: send invite, hit cancel, confirm receiving hosts' notifications disappear.