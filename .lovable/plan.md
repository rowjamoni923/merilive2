## 4 Fixes — Live/Party Screens

### 1. Send Button (3D press + keyboard shift)
**File:** `src/pages/LiveStream.tsx` line ~4479 send button + line 4448 bottom composer.
- Remove `whileTap scale` / `whileHover` from send FAB → replace with pure `filter: brightness()` on active state so button never visually "drops". Keep 3D radial gradient look intact.
- Wrap composer's outer `motion.div` container: remove `animate y:0` (unnecessary) and add `will-change:transform` + `transform: translateZ(0)` so keyboard-open reflow doesn't jitter.
- Ensure `bottom-kb` utility (keyboard-aware) is applied consistently; verify CSS uses `env(keyboard-inset-height, 0px)` / visualViewport listener so send button parks flush above keyboard instead of getting pushed under.
- Apply same fix in `PartyRoom.tsx` composer (parity).

### 2. Entry Animation — VIP preview parity in every Live + Party
**Symptom:** VIP shop preview (`EntryNameBarPreview.tsx`) shows premium banner + name bar + vehicle correctly; in-room (`EntryNameBarAnimation.tsx` + `UnifiedEntryAnimation.tsx`) either silent or degraded.
- Diff `EntryNameBarPreview` vs `EntryNameBarAnimation`: align rendering path (same SVGA/Lottie/VAP loader, same size, same `bottomPosition`, same gradient chrome) so what users buy = what plays in room.
- Fix `useUnifiedEntryDispatcher.ts` gating: verify `animationUrl` is being pulled from `profile.entry_name_bar_url` + `profile.entry_banner_url` and forwarded through `onEntry`/`onNameBar` callbacks. Currently join events may be received but URL empty → animation no-op.
- Ensure realtime `stream_viewers` INSERT + LiveKit `viewer_joined` signal BOTH funnel into dispatcher (one path only, deduped) so no join is missed.
- Same wiring verified/fixed in `PartyRoom.tsx` line 2561/2572.

### 3. Welcome/Join Chat Banner — Chamet-style mini
**File:** `src/components/live/BigoStyleJoinBanner.tsx` + `StackingJoinNotifications.tsx` + welcome chat row builder in `useUnifiedEntryDispatcher`.
- Shrink to ~24px height single-line pill: 10px font, avatar 16px, gradient trimmed, padding `px-2 py-0.5`, border-radius full.
- Reduce shadow/blur, single-line ellipsis for long names.
- Same reduced style applied to the coalesced welcome chat message row (Phase 5 output).

### 4. Viewer Counter — 100% accurate
Three combined fixes:
- **Stale cleanup:** shorten `stream_viewers` abandoned-session timeout from 90s → 30s in the RPC (`decrement_viewer_count_if_stale` or equivalent). Add heartbeat every 15s from active viewer client (`useViewerSession`).
- **Realtime reattach:** wrap `stream_viewers` subscription in `useEffect` with proper cleanup + reconnect on visibilitychange (currently may leak on hot-reload / tab hide).
- **Single source of truth:** stop mixing `activeViewerIdsRef.size`, `stream.viewer_count`, and RPC `recompute_viewer_count` — always trust the RPC's return value; local set only for optimistic UI (max of both).
- Migration: add index on `stream_viewers (stream_id, left_at)` if missing for the 30s cleanup query.

### Guardrails
- No touching gift/entry animation *native* pipeline (Android VAP/SVGA plugin) — pure JS/CSS + dispatcher wiring only.
- English-only UI strings.
- Admin-driven values stay from `random_call_settings` / `live_streams` tables — no hardcoded defaults.
- No design overhaul; keep current premium look, only fix broken parts.

### Verification
- Owner account (`smdollarex923@gmail.com`) → open live from second device → verify: (a) send button doesn't drop on tap, (b) VIP entry animation plays, (c) welcome banner is mini, (d) viewer count matches actual viewers, cleans up on leave.
