## Random Call — Diagnostic & Fix Plan

### What I verified

**✅ Already correct**
- Caller side (`MatchCall.tsx`) uses `mode: "broadcast"` → `random-call-enqueue` fans out to *every* online verified host via `get_online_global_hosts` (up to 800).
- Server emits Realtime `random_incoming_call` event on each host's `user-${hid}` channel.
- First-host-wins is atomic via `claim_random_broadcast` RPC; losers get `random_broadcast_taken`.
- `convert_random_to_private` RPC exists and is solid:
  - Runs at `random_window_seconds` (60s default).
  - Reads host rate from `host_match_preferences` (admin single source of truth) with safe fallbacks.
  - Creates a fresh row in `private_calls` and links it back via `linked_private_call_id`.
  - First 60s on `random_call_sessions` are recorded as `coins_charged = 0` (the random-rate billing for that window is settled by `random-call-settle`, separate from private billing) — so minute 1 stays on the random meter, minute 2+ on the private meter. ✔ matches the rule you described.
- `MatchCallOverlay` already calls `convert_random_to_private` at the 60s mark and toasts the new private rate.

**🛑 Critical bug — random call never actually reaches hosts**

There is **no client subscriber** anywhere in `src/` that listens for `random_incoming_call` on `user-${hostId}`. The backend fans out perfectly, but every host's app ignores the broadcast → no ring screen, no accept button, the call sits until ring-timeout and dies. This is why random call appears broken end-to-end.

(Private call works because it uses a different delivery path: FCM data push + `private_calls` postgres_changes. Random call has no equivalent listener.)

### Fix

1. **New hook `useRandomCallIncoming`** (mounts once for any logged-in user; verified-host gate inside).
   - Subscribes to `supabase.channel('user-' + uid)` for event `random_incoming_call`.
   - Subscribes to `broadcast-${broadcastId}` for `random_broadcast_taken` while a ring is active to dismiss losers instantly.
   - 20s ring timeout (reads `ring_timeout_seconds` from `random_call_settings`, matches server `expires_at`).
   - On Accept → `supabase.functions.invoke('random-call-host-respond', { body: { broadcast_id, action: 'accept' } })`. If `ok:true` (winner) → navigate to `/match/active?session=<id>&room=<room>`. If `ok:false` (already taken) → silent dismiss.
   - On Reject / Ignore-timeout → broadcast path is silent (per existing server logic — no reject-streak penalty for broadcast).

2. **Mount it globally** in `App.tsx` alongside the existing private-call provider so every host gets the ring regardless of which page they're on.

3. **Reuse `IncomingCallScreen` UI** if possible, or render a Chamet-style full-screen ringer (caller avatar + name + Accept/Reject) that auto-dismisses on `random_broadcast_taken`.

4. **Active-call route**: confirm `/match/active` (or equivalent) consumes `?session=…&room=…`, joins the LiveKit room, and renders `MatchCallOverlay` with `sessionId` + `hostId` so the 60s auto-convert pipeline kicks in for both caller and host.

### Out of scope (already verified working)
- Billing math, host-split %, conversion RPC, claim-atomicity, fan-out reach, reject-streak ban (24h), admin rate settings.

### Files touched
- `src/hooks/useRandomCallIncoming.ts` (new)
- `src/components/match/IncomingRandomCallScreen.tsx` (new, or reuse existing private incoming UI)
- `src/App.tsx` (mount the hook)
- Quick audit of the active-match route to make sure it accepts session/room from query/state.

No DB migration, no edge function change — server side is already correct.

Approve and I'll implement.