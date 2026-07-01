# SECTION INTEGRATION MAP — Index of all Flutter specs

Quick lookup table for Antigravity. Each row points to a deeper spec file.

| # | Section | Spec file |
|---|---|---|
| 0 | Master design tokens & all-screen overview | `merilive_flutter/UI_DESIGN_SPEC.md` |
| 1 | Profile auto-creation guarantee (3-layer safety) | `merilive_flutter/PROFILE_AUTO_CREATION.md` |
| 2 | Login Campaign Banner (full-screen, post-login) | `merilive_flutter/lib/widgets/login_campaign_banner_spec.md` |
| 3 | Home banners (Top Bonus + Promo above 6 cards) | `merilive_flutter/lib/screens/home/home_banners_spec.md` |
| 4 | Diamond Recharge / My Diamonds | `merilive_flutter/lib/screens/recharge/recharge_screen_layout.md` |
| 5 | Profile (User / Host / Agency 3-persona router) | `merilive_flutter/lib/screens/profile/profile_persona_router.md` |
| 6 | VIP Membership (Plans + My Progress) | `merilive_flutter/lib/screens/vip/vip_screen_layout.md` |
| 7 | Invitation + Daily Tasks | `merilive_flutter/lib/screens/invitation/invitation_and_tasks_layout.md` |
| 8 | Backend models, RPCs, security map | `merilive_flutter/SECTION_INTEGRATION_MAP.md` |
| 9 | API & RPC reference | `merilive_flutter/API_REFERENCE.md` |

## Click-flow cheatsheet (banners)

| Banner | Source | `link_type` | Tap destination |
|---|---|---|---|
| Login full-screen campaign | `banners` table, last by `display_order` shown post-login (1×/session) | varies | In-app route OR in-app WebView (NEVER external) |
| Home top "5 Hours = $5 Bonus" | `banners` table, last entry | `internal` | `/host-dashboard?tab=bonus` → renders `NewHostBonusCard` |
| Home promo above 6 cards | `banners` table, all except last | varies | Same handler as Top |

## RPCs referenced in specs

| RPC | Used by |
|---|---|
| `ensure_user_profile()` | Profile bootstrap |
| `recharge_user_diamonds(...)` | Recharge purchase verification (server-side) |
| `purchase_vip_subscription(tier_id)` | VIP subscribe |
| `equip_vip_item(...)` | VIP privilege selection |
| `claim_task_reward(task_id)` | Daily missions |
| `exchange_user_beans_to_diamonds(...)` | Host beans → diamonds (auto-routes to agency if owner) |
| `get_host_live_bonus_state(_host_id)` | Bonus card state |
| `record_host_live_minute(_host_id)` | Per-minute heartbeat |
| `claim_host_live_hour_bonus(_host_id, _hour_number)` | Hourly bonus claim |
| `get_agency_diamond_balance(owner_user_id)` | Local Pay helper visibility |

## Realtime channels (use unique names — see memory `supabase-realtime-subscription-standard`)

| Channel | Tables |
|---|---|
| `recharge:user:{id}` | profiles, coin_packages, currency_rates, first_recharge_bonus |
| `profile:{id}` | profiles, host_applications, face_verifications, agencies |
| `vip:user:{id}` | vip_tiers, user_vip_subscriptions |
| `tasks:user:{id}` | daily_tasks, user_task_progress |
| `home:banners` | banners |
| `invites:user:{id}` | invitation_referrals, invitation_earnings |
