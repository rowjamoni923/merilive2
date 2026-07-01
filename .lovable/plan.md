
# Sector 2 — Home Tab (Flutter Rebuild Plan)

Full parity with web `src/pages/Index.tsx` (970 lines) + all home widgets.
Design-sacred: pixel-perfect port of every color, gradient, shadow, spacing, animation.
Data source: Admin Panel = single source of truth (no hardcoded numbers).

## A → Z Scan Result (What Web Home Contains)

```text
┌─ HEADER (sticky, safe-area, glass card, shadow) ─────────────┐
│ [🔍 Search 36pt]  [Popular│Live│New│Follow pill tabs]  [🏆]  │
│ ─────────────── Country chip row (horizontal scroll) ─────── │
│ [🌍 All] [🇧🇩 BD] [🇮🇳 IN] [🇵🇰 PK] [🇳🇵 NP] … + dynamic  │
└──────────────────────────────────────────────────────────────┘
┌─ SCROLL BODY (pull-to-refresh) ──────────────────────────────┐
│ 1. DynamicBanner position="top"   ← banners table            │
│ 2. Grid 2-col: first 6 host cards (aspect 3/4)               │
│ 3. DynamicBanner position="middle"                           │
│ 4. Grid 2-col: remaining host cards                          │
│ 5. Empty state (glow halo + gradient icon + CTA) when 0      │
└──────────────────────────────────────────────────────────────┘
┌─ OVERLAYS ───────────────────────────────────────────────────┐
│ • FullScreenPromoBanners (rating_banners, event popups)      │
│ • DailyLoginPopup (rewards)                                  │
│ • FloatingRandomMatchPill (bottom-right)                     │
└──────────────────────────────────────────────────────────────┘
```

### Host Card Anatomy (LiveStreamCard / UserCard)
- Aspect 3/4, rounded-2xl, dynamic shadow by level & live state.
- Live thumbnail (Ken-Burns) OR avatar (with placeholder fallback).
- Top-left status pill: **LIVE (red pulse) / BUSY (amber) / ONLINE (green pulse)**.
- Top-right: viewer count pill (Eye icon) when live; verified checkmark badge.
- Bottom overlay: mini avatar + frame, display name, LevelBadge, CountryFlag.
- Bottom-right: **CallButton** — only for online female hosts, not busy.
- Tap routing (locked by user):
  - `isLive === true` → **LiveStream viewer** (`/live/:id`)
  - `is_online === true` (not live) → **ProfileDetail** (`/profile-detail/:id`)
  - `actuallyBusy === true` → **ProfileDetail** (still opens profile, not call)
  - offline → **ProfileDetail**

### Data (Supabase RPCs & tables — already exist)
- `get_public_home_hosts_v2(country, sub_tab, current_user_id)` — feed.
- `get_public_host_countries_v1()` — dynamic country chips.
- `banners` — Dynamic banners by `position` (`top` / `middle`).
- `popup_event_banners` — event popups.
- `rating_banners` + `rating_reward_claims` — rating rewards.
- `daily_login_rewards` — daily reward calendar (admin-managed).
- `leaderboard_reward_config` — trophy button destination data.
- Realtime: `live_streams`, `private_calls`, `random_call_sessions`, `party_rooms`, `profiles` — reorder feed instantly.

### Sort Order (locked, must match web exactly)
1. LIVE (longest streaming first) → 2. ONLINE (longest online first) → 3. OFFLINE.

## Build Order (8 steps)

**H1 — Home Scaffold & Header**
- `home_tab_page.dart`: sticky glass header, safe-area, shadow.
- Search icon → `/search` route (placeholder next sector).
- Sub-tab pill row: Popular / Live / New / Follow — gradient active state, red dot on Live.
- Trophy button (right) → `/leaderboard`.
- Uses admin-configured tab labels/order if present.

**H2 — Country Filter Row**
- Horizontal scroll chip row (design tokens: pearl card, gradient active).
- Static seed (BD/IN/PK/NP/PH/ID) + merged dynamic list from `get_public_host_countries_v1`.
- "All 🌍" always first. Selection triggers feed refetch (single source of truth).

**H3 — Feed Repository & State**
- `HomeFeedRepository` calling `get_public_home_hosts_v2` RPC.
- `HomeFeedCubit` (flutter_bloc) — country + subTab + userId as dependencies.
- LocalStorage snapshot cache (parity with `index-hosts-instant-cache-v3`) so cold-start paints instantly.
- Client-side sort (LIVE→ONLINE→OFFLINE, then longest-first inside each bucket).
- Realtime subscriptions on 5 tables → debounced invalidate (150ms rooms, 600ms profiles) — identical to web timings.

**H4 — Host Card Widget**
- `HostCard` widget: aspect 3/4, RoundedRectangleBorder, dynamic BoxShadow.
- Image loader: live thumbnail (Ken-Burns via `AnimatedScale`) → avatar → gender-aware placeholder → default. Same fallback chain as web.
- Status pill (LIVE/BUSY/ONLINE) with pulsing dot animation.
- Viewer-count pill, verified badge, LevelBadge, CountryFlag, mini avatar with frame.
- CallButton child (online female non-busy only) — real navigation into private-call flow (deferred to Sector 7; here it just triggers a placeholder toast until Sector 7 lands, per honesty rule).
- Tap routing matrix locked as above.
- Grid: `SliverGrid` 2-col, 8px gap, edge padding 8px.

**H5 — Dynamic Banners (top + middle)**
- `DynamicBannerWidget(position)` reading `banners` table, filtered by admin `position` field + `active` + schedule window.
- Swipeable carousel (PageView + indicators) when >1 banner per slot.
- Tap → deep-link URL from admin row (external URL / internal route).
- Insertion: top banner above grid, middle banner between first 6 cards and remainder (exact parity).

**H6 — Overlays: Daily Reward + Event Popup + Rating**
- `DailyLoginPopup`: shows on first Home mount per day, reads `daily_login_rewards` config from admin, gradient calendar UI, claim RPC.
- `FullScreenPromoBanners`: sequential popups from `popup_event_banners` (event) + `rating_banners` (rating), dismiss persistence per-user.
- Show ONLY over Home tab, respecting min-app-open threshold from admin.

**H7 — Floating Random Match Pill + Pull-to-Refresh**
- Bottom-right floating pill (gradient), tap → random match flow (placeholder until Sector 7).
- Native pull-to-refresh (CupertinoSliverRefreshControl on iOS, MaterialClassicHeader Android) → invalidates feed cache.

**H8 — Empty State + Polish**
- Contextual empty view (Popular/Live/New/Following) with animated glow halo, gradient circle icon (Compass/Radio/Sparkles/Heart), CTA.
- Skeleton shimmer for first-load only (not stale-refresh).
- Performance: `AutomaticKeepAliveClientMixin` on tab, `RepaintBoundary` around each card, precacheImage for first 8 cards, image cache limit tuned.
- Analytics event on card tap, banner tap, tab switch.

## Technical Details

- **State**: `flutter_bloc` — `HomeFeedCubit`, `CountryFilterCubit`, `SubTabCubit`, `BannerCubit`, `DailyRewardCubit`.
- **Routing**: `auto_route` — `/home` (inside shell), `/live/:id`, `/profile-detail/:id`, `/leaderboard`, `/search`.
- **Realtime**: existing `supabase_flutter` Realtime channels; single shared channel manager reused across sectors.
- **Design tokens**: Extend `DT` with `homeCardShadow`, `statusPillLive/Busy/Online`, `countryChipGradient`, banner radius/shadow — all mirroring web hex.
- **Honesty rule**: Any button whose destination lives in a later sector shows a real toast "Coming in Sector X" — never fake screen.
- **Admin parity**: Country list, banner order, popup thresholds, daily-reward amounts, rating trigger thresholds — every value read from admin tables. No hardcoded fallback numbers.

## Deferred to Later Sectors (Honesty)
- LiveStream viewer screen → **Sector 6**.
- Private-call initiation from CallButton → **Sector 7**.
- Profile Detail page → **Sector 5**.
- Leaderboard page → later Sector.
- Search page → later Sector.

Home cards will *navigate* to these routes; the destination screens themselves are built in their own sector. Placeholder scaffolds land immediately so nothing breaks.

## Verification Checklist (per step)
- Static analyzer clean (`flutter analyze`).
- Widget layout visually matches web screenshot (I will note "APK rebuild required to verify on device" honestly — Lovable sandbox can't run Flutter).
- All admin values resolve from DB, no hardcoded numbers.
- Realtime reorder confirmed via SQL insert simulation.
