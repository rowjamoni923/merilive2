
## কী হবে (৩টা অংশ)

### ১. Helper home-এর "Level 6" card-এ UI fix
**File:** `src/components/helper/ApplyLevel6Card.tsx`

- বেগুনি/পার্পল gradient সরিয়ে app-এর design language-এ আনব: **amber → orange → rose** gradient (Helper dashboard-এর Diamond Helper header-এর সাথে সামঞ্জস্যপূর্ণ)।
- "L6" badge → solid gold/amber chip।
- Text পরিষ্কার করব: title-এ truncate বন্ধ (এখন "Level 6 — Coun..." দেখাচ্ছে), description rewrite — "Apply for Country Super Admin role — manage your country's payroll, sign contract, earn 25% commission."
- "Apply" button — high-contrast white-on-dark, disabled state পরিষ্কার।

### ২. Application form refactor (`/super-admin/apply`)
**File:** `src/pages/SuperAdminApply.tsx`

বাদ যাবে:
- **Deposit transaction reference** field (input)
- **Deposit proof (screenshot)** upload
- **Deposit amount (USD) input** (helper বসাবে না — admin verify করার সময় বসাবে)
- **Requested commission %** field (admin সিদ্ধান্ত নেবে)

যোগ হবে:
- **Back button** (top-left, `navigate(-1)`) — sticky header-এ।
- Header-এ professional banner: "Step 1 of 2 — Submit Application. Step 2: Our team will contact you via your official email to coordinate the $10,000 deposit and onboarding."
- Submit success toast আপডেট: "Application submitted. Our team will contact you at <email> within 24-48 hours."
- Notes field রাখা হবে (helper অতিরিক্ত info দিতে পারবে)।

### ৩. Admin panel — dedicated section + auto-provisioning link
**Already exists** at `/admin/super-admin-management` কিন্তু sidebar-এ register করা নাই, আর approval flow-এ "এই person-কে এই link দাও" feature নাই।

কাজ:
- **Sidebar registration:** `admin_sections` table-এ একটা নতুন section: `key='country_super_admin'`, `label='Country Super Admin (L6)'`, `route='/admin/super-admin-management'`, dedicated icon (Crown/Shield)। Route guard `routeSegment="user-management"` → `"country_super_admin"` এ আপডেট।
- **Approve dialog এ deposit_amount_usd input যোগ:** admin verify করে actual deposit amount (USD) বসাবে; এটাই DB-তে যাবে।
- **Auto-provision Active Admin link:** approval সফল হওয়ার সাথে সাথে dialog-এ একটা **"Copy Country Admin Link"** button পাবে: `https://<app>/country-admin/dashboard?country=<CODE>` — এই link copy করে email-এ পাঠানো যাবে। (route `/country-admin/dashboard` ইতিমধ্যেই `country_payroll_admins` row থাকলে full access দেয় — RLS by user_id/country_code, কোনো extra grant দরকার নাই)। যদি route নাই থাকে, একটা placeholder dashboard route reuse করব — এই plan-এ আমি check করে confirm করব implementation-এর সময়।
- **Active tab-এ:** প্রতিটা admin-এর row-এ "Copy access link" button + "Send onboarding email" button (Resend edge function, যা already আছে - reuse) — subject: "🎉 You are now Country Super Admin for <country>"।

### ৪. Security & integrity
- `approve_country_super_admin_application` RPC-এ একটা নতুন parameter `_deposit_amount_usd` add — admin-confirmed amount। (form-থেকে আসা amount আর trust করব না)। `min_deposit_usd` check আগের মতই।
- কোনো RLS dropping নাই, কোনো grant change নাই — শুধু RPC signature extend।

## কী touched হবে না
- Existing `country_payroll_admins`, `country_super_admin_applications`, `country_super_admin_settings` schema unchanged।
- Active Admin dashboard logic / commission calc / withdrawal flow unchanged।
- Helper Levels 1-5 flow সম্পূর্ণ untouched।

## Files to create/edit
1. `src/components/helper/ApplyLevel6Card.tsx` — UI fix
2. `src/pages/SuperAdminApply.tsx` — remove deposit fields, add back button, professional header
3. `src/pages/admin/AdminSuperAdminManagement.tsx` — deposit input in dialog, copy-link & send-email buttons
4. Migration: `admin_sections` row insert + `approve_country_super_admin_application` RPC extend
5. Possibly small edge function for onboarding email (or reuse existing transactional email path — confirm at implementation)

## একটা প্রশ্ন
"Copy access link" এর target route কি **`/country-admin/dashboard`** নাকি **`/admin?country=XX`** (যেহেতু approved admin আলাদা admin panel-এ login করবে)? আমি code check করেছি — `country_payroll_admins` table থাকলেও আলাদা "country super admin dashboard" page এখনো নাই। দুটো option:

(a) **নতুন dedicated page বানাব**: `src/pages/CountryAdminDashboard.tsx` — country-scoped withdrawal queue, commission, payment methods। (~১টা নতুন file, full feature)
(b) **Existing helper dashboard reuse** — Level 6 হলে শুধু country-scope filter add করব। (faster, কম code)

কোনটা চান?

## 2026-06-23 — Homepage Leaderboard 3D trophy fix

- User screenshot target: homepage top-right leaderboard button in `src/pages/Index.tsx`, not the shared `Header.tsx` button.
- Professional mobile target size: W3C WCAG guidance says custom touch targets should be at least **44×44 CSS px**; current homepage button was **36×36 px**, so it looked tiny and under-premium. Source: W3C Understanding SC 2.5.5 Target Size Enhanced (`w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html`).
- Live-streaming competitor pattern: BIGO highlights ranking/host support flows as important engagement surfaces, so ranking entry should read like a prominent reward/status object, not a flat small icon. Source: BIGO Live operating/ranking materials surfaced in web research.
- Fix plan: enlarge homepage leaderboard to **52×52 px**, keep it perfectly circular, use the existing transparent 3D trophy asset at **38×38 px**, add layered gold coin-like bevel, inner depth shadow, glass highlight, rotating shine, premium glow, and reduced-motion fallback.

## 2026-06-23 — Admin setup/config failure audit

- User-reported class: admin setup forms fail when required DB columns are omitted, and numeric inputs do not type correctly when every keystroke writes to DB then refetches.
- Professional pattern: admin CRUD/config tools should validate typed fields, keep local controlled draft state, and commit on explicit save or blur instead of refetching every keystroke; inline CRUD tools use smart forms and typed column handling. Sources: Makerkit/Supamode Data Explorer CRUD docs (`makerkit.dev/docs/supamode/features/data-explorer-crud`), React controlled form/draft guidance (`reactuse.com/blog/react-form-handling-hooks/`), UX StackExchange save-on-blur discussion (`ux.stackexchange.com/questions/87638/...`).
- DB audit verified: `limited_time_offers` had required `coins_amount`, `original_price`, `offer_price`, `starts_at`; admin UI omitted them. Fixed with safe defaults and explicit insert values. UI also referenced `bonus_percentage`, `badge_text`, `total_claimed`, `total_max_claims`; fixed by adding columns.
- DB audit verified: `daily_login_rewards_config` required `reward_type` and `reward_amount`; fixed safe defaults so config rows cannot fail from omitted legacy fields.
- DB audit verified: `user_beans_exchange_tiers.tier_name` required; fixed safe default.
- Frontend audit fixed: `AdminLeaderboardManagement` already uses controlled commit-on-blur for reward tiers; added same pattern to `PKCompetitionManager` reward tiers and `AdminRewardsManagement` daily-login/cashback tiers.
- Exact logic bug fixed: `AdminInvitationSettings.toggleActive` was updating `invitation_settings` instead of `invitation_reward_tiers`.

## 2026-06-23 — App-wide media/video-icon audit

- User video confirms the main visible bug is Face Verification host Step 2: selected video rendered as a generic browser/video play icon instead of a real moving preview; Live Face Scan fallback also exposed a white camera box when the stream surface was not ready.
- Professional live/social apps do not show broken generic media icons for user-generated media: BIGO emphasizes stream cover photos as the click-driving surface, so live cards must render cover/host media instead of placeholders (`bigo.tv/blog/bigo-live-cover-photo-guide`).
- Realtime video standard: first-frame rendering should be optimized so users see media quickly instead of waiting on blank/icon states; Agora docs define first-frame render time as a key UX metric (`docs.agora.io/en/video-calling/best-practices/optimize-frame-rendering`). Translate to our LiveKit path: keep LiveKit for room media, but show real thumbnails/first frames in lists and message previews.
- Immediate fixes applied: chat pending video preview now uses real local object URL video preview, chat video bubbles autoplay muted/inline instead of generic icon, face-verification uploaded/recorded intro video previews autoplay real frames, and private face-verification signing fallback now stores a resolvable storage reference instead of a broken public URL.
