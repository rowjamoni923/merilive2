## Single-Device Login (✅ DONE this turn)

Root cause: `profiles` table was not in the `supabase_realtime` publication, so the realtime `UPDATE` listener in `useSingleDeviceSession` never fired on the old device. Combined with the recently-removed polling, the old device was effectively never kicked.

Fix shipped:

1. New table `public.user_active_sessions(user_id PK, session_id, device_info, updated_at)` — added to the `supabase_realtime` publication with `REPLICA IDENTITY FULL`. Backfilled from current profiles.
2. `update_active_session` RPC now upserts into the mirror table on every register.
3. `useSingleDeviceSession` realtime channel listens to `user_active_sessions` (both UPDATE + INSERT) instead of `profiles`. Old device receives the new session_id within ~1 second → triggers `forceLogout` instantly. Grace period (30s new-device + 15s reconnect) preserved.
4. Fresh-login detection hardened: now also listens directly to Supabase `onAuthStateChange('SIGNED_IN')` event + a 30-second `meri_fresh_signin_uid` localStorage marker, so even after a fast reload the new device wins.

Expected behaviour now: phone A logs in → phone B logs in with same account → phone B writes a new session_id → realtime row arrives on phone A → phone A shows toast "Signed out — your account is now active on another device" and routes to /auth. No polling, no reload, no freeze.

---

## Games — Professional Pass (proposed, needs your OK)

Scope you described: all 5 live games (Lucky Number, Ferris Wheel, Rocket Race, Roulette, Teen Patti) — broken open/blank, bet button doesn't work, result/animation off, balance not updating reliably, text colour collides with background. Keep the existing game system, just bring it to a professional level.

This is large. Suggested work split into 5 packages so we can ship + verify each one, instead of one mega-edit that breaks more than it fixes.

### Pkg A — Game shell & open/blank fix (foundation, do first)
- Audit `LiveGameBoard`, `LiveGame3DStage`, `Game3DContainer`, `GlobalGameOverlay`, `ProfessionalGameOverlay` for missing explicit dimensions on Canvas parents, missing `<Html>` wrappers, lazy-load failures.
- Add a single `GameErrorBoundary` so a crash inside one game never shows a blank screen — fallback to a "Retry" card.
- Ensure each game mounts behind a `Suspense` with the same skeleton, not a blank div.

### Pkg B — Bet flow correctness
- Standardise on one `useGameBet` hook calling the existing `processGameBet` / `processGameWin` RPCs (per `mem://technical/secure-game-transaction-standard`).
- Disable bet button while a bet is in-flight; show toast on RPC error instead of silent failure.
- Use `CompactBetControls` everywhere; remove the older `BetControls` duplication.

### Pkg C — Result reveal + animation polish
- One shared `useGameRound` hook that drives countdown → reveal → settle for all 5 games using server-emitted round events (no client-side timers diverging).
- Fix animation finish handlers (Ferris wheel stops on winning slot, Rocket lands at result row, Lucky Number flips at the right card, Roulette ball locks on the correct pocket, Teen Patti reveals real cards).
- Win popup uses a single `WinPopup` component with confetti only on wins ≥ threshold.

### Pkg D — Balance integrity
- Remove any client-side optimistic balance math. Read live balance only from the singleton balance cache (per `mem://ui/balance-display-integrity-v2`).
- After every `processGameWin` RPC, invalidate the balance query key — no polling.

### Pkg E — Professional visual pass (uses our design tokens)
- Replace any literal `text-white` / `text-slate-*` / hard-coded hex inside game files with semantic tokens (`text-foreground`, `bg-card`, `border-border`, etc.) so contrast works on both light and dark.
- Apply the existing `luxury` + `glass` Button variants for primary actions.
- Use one shared gold/purple gradient header per game (matches the rest of the app's Ultra-Premium Luxury aesthetic).
- Run the contrast guard (`npm run check:contrast:baseline`) at the end so we never regress again.

### Suggested order & size
- Pkg A → 1 turn
- Pkg B → 1 turn
- Pkg C → 2 turns (animations are per-game)
- Pkg D → 1 turn
- Pkg E → 1 turn

### Open questions before I start Pkg A
1. Do you want me to keep all 5 live games visible, or temporarily hide the ones we haven't polished yet so users don't see broken ones?
2. Any specific game I should fix **first** (the one most users complain about)?
3. For the "professional" look, do you want me to use the existing Luxury/Gold theme (matches VIP/Noble) or pick a new visual direction via design previews?

Once you answer those 3, I'll start with Pkg A in the next turn.