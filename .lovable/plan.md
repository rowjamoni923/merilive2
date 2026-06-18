# Mobile-First Redesign Plan

Design SACRED rule officially lifted (memory updated). Full mobile redesign permitted across all screens. Android-native performance path + camera continuity rules remain sacred.

## Scope reality check

"প্রত্যেকটা page" = 40+ screens. Doing all at once = no review, no rollback safety, guaranteed regressions. So I'm phasing it strictly. After each phase you test on owner account; we move to the next only when you confirm.

For each phase I will:
1. **Research** competitor (Chamet/Bigo/Olamet/Poppo/HiiClub) mobile patterns — locked in plan.md
2. **Capture** current screen via Playwright at 390×843 mobile viewport
3. **Generate 3 design directions** (rendered prototypes) — you pick one
4. **Implement** the chosen direction; verify on owner account
5. **Move to next phase**

## Phase order (priority-locked)

### Phase 1 — Homepage banner + feed (START HERE, your priority)
- Top hero banner carousel — proper mobile aspect, swipe physics, dot indicators
- Live/Party card grid — Bigo-style 2-col with proper density, ribbon badges, viewer count, gift icon
- Tab strip (For You / Live / Party / Following) — sticky, momentum scroll
- Bottom nav — safe-area aware, active state, badge dots
- Pull-to-refresh + skeleton loaders
- Search header — collapsible on scroll

### Phase 2 — Live Streaming screen
- Host UI: floating control dock, viewer ribbon, gift cascade slot, chat overlay z-stack
- Viewer UI: gesture-driven (tap=hide chrome, swipe-up=next stream, swipe-down=exit), gift drawer, follow CTA
- Safe-area: top status bar + bottom gesture bar
- Combo gift animation slot, entry banner slot, PK battle scoreboard

### Phase 3 — Private Call screen
- Incoming call full-screen: caller avatar parallax, accept/decline thumb-zone buttons
- Active call: PiP-style local preview corner, controls auto-hide after 3s, gift sheet half-modal
- End-call confirmation, post-call rating sheet

### Phase 4 — Party Room
- Seat grid mobile-optimized (2×4 or 3×3 based on roomType), tap-target ≥48dp
- Mic mute/unmute, gift target picker, chat dock, game launcher tray
- Host controls drawer

### Phase 5 — Secondary pages (batched)
- Profile, Wallet, Wallet history, Agency dashboard, Trader dashboard
- Settings, Notifications, Followers/Following
- Auth (login/signup), Onboarding, Face Verification

## Technical approach

```text
┌─────────────────────────────────────────────────┐
│ Tailwind tokens (index.css)                     │
│  • Mobile-first breakpoints (default → md → lg) │
│  • Safe-area CSS vars (--sat / --sab / --sal)   │
│  • Touch target min-h-11 (44px) baseline        │
│  • Type scale: 12/14/16/18/22/28 mobile         │
└─────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────┐
│ Shared components (refactor per phase)          │
│  • <MobileShell>, <SafeAreaInset>               │
│  • <StickyHeader>, <BottomNav>                  │
│  • <SwipeableCarousel>, <PullToRefresh>         │
│  • <BottomSheet>, <FullScreenModal>             │
└─────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────┐
│ Page-level redesign (per phase, behind feature  │
│ flags for staged rollout)                       │
└─────────────────────────────────────────────────┘
```

## What stays untouched (locked rules)

- Native Android camera/LiveKit/GPUPixel/VAP/SVGA pipeline — zero changes
- Camera continuity (preview → broadcast handoff, ringing → accepted call)
- Business logic, RPC payloads, RLS policies, edge functions
- English-only UI copy
- Camera/mic permission flows

## Next action

**Phase 1 start:** I'll capture the current homepage at 390×843, then generate 3 mobile-first design directions (banner + feed combined). You pick one, I build.

Approve to proceed with Phase 1?
