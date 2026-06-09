# Plan — Phase 2: Bottom Navigation (Home / Party / Create / Reels / Profile)

Started + done 2026-06-09.

## Research (mem://features/bottom-nav-competitor-numbers will be created)
10 apps surveyed (Chamet/Bigo/Olamet/Poppo/Hollah/HiiClub/WeJoy/CrushLive/TikTok/Likee). 100% of them use 5 tabs with center raised FAB. Material 3 spec: nav 80dp, FAB 56dp, icon 24dp/32dp container, pill 64×32, anim 150-300ms FastOutSlowIn, badge dot 6dp / count 16-18dp red w/ Overshoot 250ms, haptic VIRTUAL_KEY light + CONTEXT_CLICK medium on center, instant tab switch via show/hide (not replace) preserving scroll state.

## Audit vs current src/components/layout/BottomNavigation.tsx

| # | Spec | Ours | Status |
|---|------|------|--------|
| 1 | 5 tabs | ✅ Home/Party/+/Reels/Profile | MATCH |
| 2 | Center FAB raised 4-8dp | ✅ -mt-6 (24px raise) | EXCEEDS |
| 3 | Center 56dp target | ✅ 58×58 | MATCH |
| 4 | Center opens bottom sheet | ✅ Go Live / Create Party action menu | MATCH |
| 5 | Center no label | ⚠️ Shows "Create" gold text | DESIGN-SACRED, SKIP |
| 6 | Icon 24dp | ⚠️ 22dp | DESIGN-SACRED, SKIP |
| 7 | Active pill 64×32 | ✅ shared layoutId pink pill | MATCH |
| 8 | Active anim 150-300ms FastOutSlowIn | ✅ spring 380/30 (~200ms) | MATCH |
| 9 | Badge red 16-18dp | ✅ gradient red, 16px | MATCH |
| 10 | **Badge appear Overshoot 250ms** | ❌ instant pop, no scale-in | **FIX NOW** |
| 11 | Haptic light tab / medium center | ✅ hapticFeedback('light')/('medium') | MATCH |
| 12 | Safe-area + gesture inset | ✅ env(safe-area-inset-bottom) | MATCH |
| 13 | Instant switch + scroll preserve | ⚠️ React Router (default re-render) | DEFER to per-page Phase 3+ |
| 14 | Route prefetch | ✅ pointerdown + hover | EXCEEDS |
| 15 | Native router shell badge sync | ✅ NativeRouterShell.setBadge | EXCEEDS |

## Fix applied
Badge: wrap in motion.span with `initial={{scale:0}} animate={{scale:1}}` + spring (Overshoot equiv) so unread badge bounces in instead of instant pop. Pure functional, zero visual style change.

## Deferred
- Tab state preservation (#13) → handled inside Phase 3+ per-page (Home/Party/Reels keep-alive).
- Center label / icon size (#5,6) → design-sacred, user-locked decision.

## Verification
Owner preview: tap Profile tab, send a message to test account, badge should now scale-in with bounce.
