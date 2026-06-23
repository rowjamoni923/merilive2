
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
