## Mobile Customization Plan (A-to-Z, Android WebView 360–412px)

**Constraint (locked):** WEB DESIGN SACRED — কোনো color, layout, copy, logo, gradient, font change হবে না। শুধু mobile-fit bugs (overflow, tap target, padding, font sizing, sticky/safe-area, scroll trap) ঠিক করা হবে। design redesign করতে হলে আগে আলাদাভাবে অনুমতি নেব।

**Target:** Capacitor WebView, Android phones (360px – 412px CSS width), notch + gesture nav safe-area সহ।

### Acceptance criteria per page
1. কোনো horizontal scroll নেই (`overflow-x: hidden` at root + per-section fix)
2. সব interactive element ≥ 44×44 px tap target (WCAG 2.5.5)
3. কোনো text < 12 px বা truncate hidden নেই; long usernames/numbers ellipsis-protected
4. Top inset = `env(safe-area-inset-top)`, bottom inset = `env(safe-area-inset-bottom)` properly respected
5. Sticky headers + bottom nav কোনো content overlap করছে না
6. Modals/sheets full-width fit (no side cutoff), close button reachable
7. Forms: input zoom prevent (`font-size ≥ 16px`), keyboard dismiss OK, scroll-into-view OK

### Wave A — Home + Banner + Reels (priority 1)
- `src/pages/Index.tsx` (home shell, bottom nav)
- Home banner carousel — fix swipe edge gutter, dot indicator tap area
- `Reels.tsx` + `LiveStreamFeed.tsx` — full-bleed 100dvh, action bar safe-area, gift button reachable
- `CreateParty.tsx`, `GoLive.tsx` entry buttons — touch target

### Wave B — Live + Party + Private Call (priority 2, design-sacred surfaces)
- `LiveStream.tsx` — gift drawer, chat input, PK bars, top-right action stack — no overflow, safe-area top/bottom, keyboard-aware chat
- `PartyRoom.tsx` — 9-seat grid responsive (360→412 same), mic indicator visible, bottom drawer fit
- Private call (`ActiveCallScreen`, `IncomingCallModal`, `CallConfirmModal`) — full-bleed, hangup button reachable, balance pill no overflow
- **NO functional changes** — just CSS responsiveness on existing structure

### Wave C — Profile / Profile detail / My invitation
- `Profile.tsx`, `ProfileDetail.tsx`, `EditProfile.tsx` — header avatar + stats grid wrap, follow/message buttons tap-size, tab strip horizontal scroll OK
- `Invitation.tsx` — share card, QR/code copy button, leaderboard list rows
- `FollowingList.tsx`, `SearchUsers.tsx` — list row min-height 56, avatar + meta no overflow

### Wave D — Money flows (Wallet / Recharge / Withdrawal / Shop / VIP / Level / Agency / Helper)
- `Recharge.tsx`, `RechargeHistory.tsx` — package grid 2-col on 360, USD/BDT amount no clip
- `AgencyWithdrawal.tsx`, `AgentWallet.tsx`, `HostTransferHistory.tsx` — table → card swap on mobile
- `Shop.tsx` — tabs scroll, item card 2-col, owned badge no overlap
- VIP membership section, `Level.tsx`, `Leaderboard.tsx`, `PKLeaderboard.tsx` — sticky tabs safe-area, podium responsive
- `AgencyDashboard.tsx`, `AgencyDetails.tsx`, `AgencyHostManagement.tsx`, `AgencyCommissionHistory.tsx`, `AgencyTransferHistory.tsx`, `HelperDashboard.tsx`, `Level5HelperDashboard.tsx` — stat card 2-col on mobile, table → card, action button bar safe-area

### Execution rules
- **Per-page edit only Tailwind responsive utilities** (`sm:`, `md:`) and existing semantic tokens — never inline color, never new gradients
- **One wave per response** so the user can verify each before next wave starts
- Each wave ends with `bunx vitest run` + visual screenshot in mobile viewport
- Owner-account login test on actual surface where applicable (`smdollarex923@gmail.com`)
- কোনো wave-এ যদি real layout (component restructure) লাগে, **আগে user-কে জিজ্ঞেস করব** — silently redesign করব না

### Out of scope (will NOT touch this round)
- Component restructure / new components
- Animation/gift/entry visual code (memory protected)
- Native Android plugins
- Color tokens, font, logo, gradient
- Business logic, RPC, edge functions, RLS
- Tablet (768+) — phone only this pass

### Technical notes
- Global add: `html, body { overflow-x: hidden }` + container `max-w-full` audit
- Add util class `.mobile-tap` = `min-h-[44px] min-w-[44px]` for icon buttons লাগলে
- Form inputs base `text-base` (16px) to block iOS/Android zoom-on-focus
- Use `pb-[max(env(safe-area-inset-bottom),16px)]` for bottom-anchored bars
- Sticky header + bottom nav already in shell — only audit, don't rebuild

### Deliverable
4 waves, each = 1 chat response with diff + verification. Total ETA ≈ 4 working sessions।

## Mobile customization — Wave A partial fix — DONE 2026-06-10
- Global Android WebView overflow guard added in `src/index.css`: `html/body/#root` now cap at `100vw` and hide stray horizontal overflow.
- Auth/landing visible mobile screen hardened: CTA buttons now ≥44px tap targets, Terms agreement row wraps instead of clipping, container max-width guarded.
- Reels hardening: root/reel panels cap at `100vw`, right action stack uses bottom safe-area, mute target raised to 44px, username truncates.
- LiveStreamFeed hardening: root max-width guarded, bottom info respects safe-area, Enter Live target ≥44px, text area min-width guarded.
- Verified current `/index` at mobile: `innerWidth=375`, `htmlScrollWidth=375`, `bodyScrollWidth=375`, `hasHorizontalOverflow=false`, visible issues=[]
- Vitest smoke: `src/test/livekitCallSignaling.test.ts` 9/9 passed.

## Wave B — DONE 2026-06-10
- Added `data-livestream-root` to LiveStream shell, `data-call-root` to ActiveCallScreen shell.
- Added `data-party-root="true"` body marker via useEffect in PartyRoom (fragment root, no shell div to tag).
- New CSS block "Wave B HARD GUARDS" in `src/index.css` scoped to non-admin + mobile (≤767px):
  - All descendants capped at `max-width: 100vw`, root surfaces `overflow-x: hidden` + `width: 100vw`.
  - Fixed bottom bars inside these surfaces get `padding-bottom: max(env(safe-area-inset-bottom), 8px)`.
  - Dialog/sheet children forced to full viewport width.
  - 9-seat party grid pinned to 3 columns at 360px (overriding the auto-collapse-to-2 rule).
- Owner-account preview at 360px verified: home/party-list/live-feed clean, no overflow. Inside-room visual verification requires a live host or active call which the preview cannot spawn solo — guards are defensive so any future content overflow is automatically clamped.
