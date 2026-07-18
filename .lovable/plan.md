## Managed Banners System — Central Admin Control

সমস্ত static banners, guideline cards, welcome popups গুলোকে admin panel থেকে edit করার একটা centralized system তৈরি করব। যেকোনো time admin থেকে text / image / CTA / colors change করলে instantly app-এ reflect হবে (Realtime subscription)।

### 1. Database (single source of truth)

নতুন table `managed_banners`:
- `slug` (unique key, e.g. `agency_dashboard_guideline`, `payroll_helper_welcome`, `new_agency_popup`, `agency_policy_hero`, `agency_commission_hero`, `agency_activation_warning`, `agency_closed_notice`, `create_agency_intro`, `agency_signup_intro`)
- `title`, `subtitle`, `body_md` (rich text/markdown)
- `image_url` (optional hero image)
- `cta_text`, `cta_url` (optional button)
- `theme` (json: bg gradient, accent color, icon name)
- `bullets` (jsonb array of {icon, title, description})
- `is_active`, `updated_at`, `updated_by`

Realtime enabled + admin-only write RLS + public read.

### 2. Seed all existing banners

Initial rows for প্রত্যেকটা জায়গা:
1. **Agency Dashboard Guideline Helper** (`agency_dashboard_guideline`)
2. **Payroll Helper Welcome Popup** (`payroll_helper_welcome`) — `PayrollHelperWelcomeModal`
3. **New Agency Created Popup** (`new_agency_popup`)
4. **Agency Activation Warning** (`agency_activation_warning`) — `AgencyActivationBanner`
5. **Agency Closed Notice** (`agency_closed_notice`)
6. **Agency Policy Hero** (`agency_policy_hero`) — `AgencyPolicy.tsx`
7. **Agency Commission Hero** (`agency_commission_hero`) — `About.tsx`
8. **Create Agency Intro** (`create_agency_intro`)
9. **Agency Signup Intro** (`agency_signup_intro`)
10. **Payroll Helper Guide Hero** (`payroll_helper_guide_hero`)
11. **Policy Documents Intro** (`policy_intro`)

(commission % / tier data আগের মতোই `agency_level_tiers` থেকে dynamic — এই banner system শুধু copy/design control করে)

### 3. Admin UI — নতুন menu tab

**Route:** `/admin/managed-banners`  
**Menu label:** "Banners & Guidelines" (Content section এ)

Features:
- Grid list of all banners with preview thumbnail + section label
- Click → editor drawer: title / subtitle / body / image upload / CTA / theme picker / bullets editor
- Live preview panel দেখায় ঠিক যেভাবে user side এ দেখাবে
- Toggle `is_active` (hide/show)
- "Reset to default" button
- Search + filter by section

### 4. Frontend hook

`useManagedBanner(slug)` — একটা reusable hook যা DB থেকে fetch করে + Realtime subscribe করে। Existing components গুলো এটা use করবে fallback default সহ, যাতে DB row না থাকলেও কিছু ভাঙে না।

### 5. Components refactor

- `AgencyActivationBanner.tsx` → hook থেকে title/body pull
- `PayrollHelperWelcomeModal.tsx` → hero image, title, subtitle, benefits, key advantages সব DB থেকে
- `CreateAgency.tsx`, `AgencySignup.tsx`, `AgencyDashboard.tsx`, `AgencyPolicy.tsx`, `PayrollHelperGuide.tsx`, `About.tsx` → hero/intro banner sections DB থেকে

Default fallback content = current hardcoded content, তাই কিছু break হবে না।

### Technical notes
- Realtime channel per slug
- Admin write via `service_role` through existing `adminSupabase` client
- Image upload uses existing `banners` storage bucket
- No breaking DB migration — additive only

---

**Deliverables:**
- 1 migration (table + RLS + seed rows)
- 1 admin page (`AdminManagedBanners.tsx`) + menu entry
- 1 hook (`useManagedBanner.ts`)
- Refactor of ~7 banner-hosting components to consume the hook
- Zero visual regression — defaults = current design

Confirm করলে implement start করব।