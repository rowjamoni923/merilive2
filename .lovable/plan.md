# Admin Panel → App Instant Update (Full Sweep)

লক্ষ্য: admin panel-এ যেকোনো change করলে app-এ **<1s এর মধ্যে** auto-reflect হবে। কোনো manual refresh, app restart, বা lag নেই।

## Strategy

প্রতিটা admin-managed table-এ ৩টা layer:
1. **DB layer** — `supabase_realtime` publication-এ add + `REPLICA IDENTITY FULL` set (যাতে UPDATE/DELETE event-এ পুরো row pay-load হয়)
2. **Cache layer** — central `useRealtimeTable(table, queryKey)` hook যা React Query cache invalidate করে
3. **Consumer layer** — প্রতিটা admin-content hook (`useGifts`, `useBanners`, `useEntryEffects`, etc.) ওই hook ব্যবহার করবে

## Phase 1 — DB Migration (one big migration)

৭০+ table publication-এ add + REPLICA IDENTITY FULL set। List:

**Visual assets (20):** gifts, gift_categories, banners, popup_event_banners, rating_banners, pk_reward_banners, entry_banners, entry_effects, entry_name_bars, vehicle_entrances, chat_bubbles, avatar_frames, role_frames, beauty_filters, ar_stickers, party_room_backgrounds, party_room_banners, onboarding_slides, app_event_themes, app_icon_registry, room_welcome_messages

**Pricing & economy (16):** coin_packages, recharge_campaigns, first_recharge_bonus, limited_time_offers, topup_payment_methods, payment_gateways, payment_methods, helper_diamond_packages, diamond_exchange_packages, currency_rates, consumption_return_config, profit_config, shop_items, subscription_plans, noble_cards, parcel_templates

**VIP & levels (10):** vip_tiers, vip_medals, vip_perks, vip_exclusive_items, feature_level_requirements, host_levels, helper_level_config, topup_helper_levels, trader_level_tiers (already in), agency_level_tiers (already in)

**Config (13):** app_version_settings, app_content, site_content, site_settings, branding_settings, daily_login_rewards_config, daily_tasks, ranking_rewards, leaderboard_reward_config, leaderboard_podium_frames, invitation_settings, invitation_reward_tiers, live_categories, live_moderation_settings, notification_templates, allowed_external_links, categories, channels

**Games & PK (10):** game_settings, game_configs, game_providers, game_server_settings, provider_games, pk_battle_assets, pk_competitions, pk_competition_rewards, lucky_gift_config, new_host_live_bonus_settings

**Content (8):** landing_page_sections, help_articles, support_categories, iptv_sources, news_sources, youtube_sources, movies, music

Excluded: log/audit/transient tables, user-private data already covered।

## Phase 2 — Central realtime hook

`src/hooks/useAdminRealtimeSync.ts` — single hook যা table name নিয়ে subscribe করবে, React Query cache invalidate করবে। Already-subscribed table-এ duplicate বসাবে না (ref-counted)।

## Phase 3 — Wire consumer hooks

প্রতিটা admin-content hook scan + wire:
- `useGifts`, `useGiftCategories`, `useBanners`, `useEntryEffects`, `useEntryBanners`, `useVehicleEntrances`, `useChatBubbles`, `useAvatarFrames`, `useRoleFrames`, `usePartyRoomBackgrounds`, `useCoinPackages`, `useRechargeCampaigns`, `useAppSettings`, `useAppVersionSettings`, `useVipTiers`, `useNobleCards`, `useShopItems`, `useGameSettings`, `useDailyTasks`, `useRankingRewards`, `useInvitationSettings`, `useLandingPageSections`, ইত্যাদি (যেগুলো অলরেডি wire করা সেগুলো skip)।

## Phase 4 — Owner-account verification

`smdollarex923@gmail.com` দিয়ে preview login → admin-এ change → app-এ ১ সেকেন্ডের মধ্যে দেখা যাচ্ছে কিনা spot-check ১০টা critical flow:
1. Gift add → gift sheet
2. Banner toggle → home banner
3. Vehicle entrance new → entrance shop
4. Coin package price change → recharge page
5. App version bump → force-update modal
6. VIP tier perk edit → VIP page
7. Daily task add → tasks page
8. Live category rename → live tab
9. Party background add → party bg picker
10. Noble card edit → noble page

## Hard rules

- **UI/design কোনো change হবে না** (memory: WEB DESIGN SACRED)
- কোনো polling বসাবে না (memory: NEVER polling)
- English-only UI strings
- প্রতিটা realtime subscription `useEffect` cleanup-সহ
- কোনো `service_role_key` frontend-এ যাবে না
- RLS policies untouched

## Deliverable

- ১টা big migration (Phase 1)
- ১টা new hook file (Phase 2)
- ~30-50 hook file edit (Phase 3) — additive only, design untouched
- Verification report (Phase 4)

## Out of scope

- VPS work (deferred per memory)
- New admin pages
- Schema changes
- Native Android changes (web React only — APK rebuild লাগবে না এই কাজে)

confirm করলে Phase 1 migration শুরু করব।
