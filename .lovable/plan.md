# Admin Panel — Real Completion Plan (Proof-First)

আগের ভুল আর করব না। প্রতিটা page real login + screenshot + data-write test করে verify করব। কোনো "global CSS দিয়ে সব done" নাটক নাই।

## Scope
`src/pages/admin/` এ মোট **173টা page**। এগুলোকে ১১টা functional batch এ ভাগ করা হলো। প্রতিটা batch = ~15-16 page।

## Per-Page Definition of Done (কঠোর)
প্রতিটা page-এ এই ৫টা check pass না হলে "done" বলব না:
1. **Visual** — `.admin-pro-shell` wrap আছে, কোনো white-on-white / neon gradient conflict নাই (real screenshot এ verified)।
2. **Data load** — real admin login দিয়ে খুললে actual DB data দেখা যায় (empty state fake না)।
3. **Data write** — edit/create/delete করলে DB তে save হয় এবং instant reflect করে (realtime বা refetch)।
4. **App propagation** — যেসব setting app-facing (price, reward, config), সেটা main app side এ instant reflect হয়।
5. **No console errors** — page load এ কোনো red error না।

প্রতিটা page-এর জন্য screenshot + short note দিব: "✅ load OK, ✅ edit test OK, ✅ propagation verified"।

## Batches (11 total)

| # | Batch | Page count | Focus |
|---|-------|------------|-------|
| B1 | Dashboard + Users + Hosts | 16 | Dashboard, UserHub, Users, Hosts, Search, Applications, Conversion, FeedRanking |
| B2 | Moderation + Bans + Devices | 15 | Moderation, ModerationAudit, LiveBans, Blocked, Device*, ContactViolations, FaceViolations |
| B3 | Face Verification + Helpers | 15 | FaceVerification*, Helper* (Applications, Management, Orders, Requests, Level5, Pricing) |
| B4 | Agencies + Commissions | 12 | Agency*, Commissions, CommissionCalculator, AgentDispatches, InvitationSettings |
| B5 | Finance + Payments | 18 | Finance, Coins, CoinTraders, ManualTopup, RechargeHistory, Withdrawals, PaymentGateways, TopupMethods, BalanceDeduction, TransferHistory, GooglePlayHealth, CryptoRecovery, OrphanPayments, CostMonitor |
| B6 | Levels + VIP + Rewards | 14 | LevelManagement, LevelTiers, LevelPrivileges, FeatureLevels, VIP*, Noble*, Rewards, LeaderboardManagement, RankingRewards |
| B7 | Visual Assets | 16 | Frames, Gifts, GiftAnimationConfig, GiftTransactions, ChatBubbles, EntryBanners, EntryBars, EntryEffects, EntryNameBars, AnimationStore, BeautyFilters, IconRegistry |
| B8 | Content + Reels + Banners | 15 | Reels, Feed, Comments, Categories, Banners, CampaignBannerHub, LandingPageManager, AllowedLinks, AiImageStudio, Branding, OnboardingSlides, Content, ContentManagement |
| B9 | Party + Calling + Games | 15 | Party*, RoomWelcomeMessages, Call*, RandomCall*, PrivateCall*, Game* (Management, Providers, Server, Settings, Leaderboard) |
| B10 | Support + Notifications + LiveKit | 17 | GmailSupport, SupportTickets, AutoActions, PushBroadcast, NoticeBroadcast, EmailBroadcast, NotificationTemplates, OtpProviders, LiveKit* (Rooms, Egress, Ingress, Sip, Webhook), ChatInspector |
| B11 | Settings + Debug + Sub-Admins | 20 | AppSettingsHub, AppVersion, AppUpdateLogs, AppUpdateTest, Blueprint, SubAdmins, DeviceApprovals, ErrorLog(s), Logs, Analytics, Blueprint, CountryDistribution, DailyDigest, NativeBridge, GlobalSearch, NumberSharing, HostConversion misc |

(Exact page list per batch will be locked when we start each batch — count is approximate, no page will be skipped.)

## Execution Rhythm

প্রতি batch এ:
1. আমি batch-এর সব page-এর কোড scan করি (parallel reads)।
2. যেগুলো broken সেগুলো fix করি (real fix, global CSS shortcut না)।
3. Playwright দিয়ে owner account (smdollarex923@gmail.com) দিয়ে login করে প্রতিটা page খুলি, screenshot নেই।
4. যেসব page-এ config edit possible সেগুলোতে test edit করে propagation verify করি।
5. Batch report দেই: **page-by-page checklist** + screenshot bundle + কোনো page fail হলে সেটা flagged।
6. তুই review করে "next batch" বললে B+1 এ যাই। ব্যর্থ page থাকলে ওইটাই আগে fix করি।

## Estimated Effort (সৎ)
- প্রতি batch = 4-8 messages (page count এবং fix depth এর উপর)।
- মোট 11 batches ≈ 55-90 messages।
- আগের Pass 1-14 এর মতো "১টা message এ সব done" আর হবে না — কারণ ওটাই দুর্নীতি ছিল।

## শুরু
তুই "শুরু কর" বললে **Batch 1 (Dashboard + Users + Hosts)** থেকে শুরু করব। চাইলে অন্য batch দিয়ে শুরু করা যাবে (যেমন Finance আগে বা Face Verification আগে) — বল কোনটা priority।
