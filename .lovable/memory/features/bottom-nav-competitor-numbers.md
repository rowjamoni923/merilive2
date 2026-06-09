---
name: Bottom Navigation competitor numbers (Phase 2)
description: Locked industry numbers for bottom nav — tabs, FAB, M3 pill, badge, haptic, switch perf. Use BEFORE any bottom nav code change.
type: feature
---
# Bottom Navigation — Industry-Locked Numbers (researched 2026-06-09)

10 apps surveyed: Chamet, Bigo, Olamet, Poppo, Hollah, HiiClub, WeJoy, Crush Live, TikTok, Likee. **100% use 5 tabs** with center raised FAB at position 3.

## Layout
- Tabs: **5** (Home · Discover/Party · **+/Live** · Reels/Inbox · Profile)
- Center button: raised **4–8 dp** above bar, **56 dp** Material FAB target, **no label**
- Center action: opens bottom-sheet modal (Bigo/Olamet/Poppo) or navigates to broadcast prep (TikTok/Likee)
- Flanking tabs: always show text label below icon

## Sizes (Material 3)
- Nav bar height: **80 dp** (M3 standard); M3 Expressive 2025: 56 dp (not yet adopted by these apps)
- Total height with gesture-nav inset: **128 dp** (80 + 48)
- Icon: **24 dp** in **32 dp** container
- Active pill: **64 × 32 dp** stadium, SecondaryContainer or brand @ 12-20% alpha
- Active indicator animation: **150–300 ms** FastOutSlowIn (live apps prefer 150-200ms)

## Badge
- Unread dot only: **6 dp**
- Count badge: **16–18 dp** pill
- Color: solid red (#F44336 or brand red), white text
- Appear: **250 ms** OvershootInterpolator bounce-in (scale 0 → 1)
- Disappear: instant fade

## Haptic
- Tab tap: `HapticFeedbackConstants.VIRTUAL_KEY` (light, ~1-5 ms)
- Center/Go Live tap: `CONTEXT_CLICK` (medium)
- No heavy vibration for nav

## Tab switching (performance)
- **Use `FragmentTransaction.show()/hide()` NOT `replace()`** — preserves scroll & state
- Cross-fade: **0 ms instant** preferred (150 ms alpha if used)
- ViewPager2 alt: BEHAVIOR_RESUME_ONLY_CURRENT_FRAGMENT, offscreenLimit=4
- G35 jank threshold with replace(): **400-600 ms** — avoid

## Edge-to-edge
- Mandatory since Android 15 / targetSdk 35
- Apply `WindowInsetsCompat.Type.navigationBars()` for gesture-nav bottom padding

## Citations
- m3.material.io/components/navigation-bar/specs
- developer.android.com/develop/ui/views/haptics/haptic-feedback
- developer.android.com/design/ui/mobile/guides/layout-and-content/edge-to-edge
- theappfuel.com/examples/tiktok_navigation
- engineeringblog.yelp.com/2024/10 (~30% nav perf)
- StackOverflow BottomNavigationView lag threads
