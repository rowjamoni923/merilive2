## Goal

Two locked deliverables:

1. **CSA Diamond Wallet settings → 100% reach Country Super Admin side** (no missing, no drift).
2. **English Policy hub for all 6 levels** (Helper L1 → Country Super Admin L6), luxurious 3D banners, deeply detailed CSA policy, linked from Email Broadcast, Email Support, and Support Ticket flows.

---

## Part A — CSA Settings Audit & Fix (precision pass)

Owner Admin Panel writes these fields into `csa_diamond_settings`:

```
min_purchase_usd, diamonds_per_usd, visibility_threshold,
owner_fallback_enabled, auto_credit_enabled,
withdrawal_bonus_enabled, withdrawal_bonus_rate_percent,
bonus_trigger_status
```

Steps:

1. Re-read every CSA consumer (`CsaDiamondWallet.tsx`, CSA purchase RPC, helper visibility selector, withdrawal-completion auto-bonus trigger, crypto webhook auto-credit path).
2. Verify each setting is read live from `csa_diamond_settings` (no hardcoded fallbacks, no stale cache, no "best guess from unrelated table"). Per admin-panel-single-source-of-truth rule: missing config → show "Not configured by admin" guard, never substitute defaults.
3. Confirm RLS / grants let CSAs read their own settings row.
4. Confirm withdrawal-bonus auto-credit fires on the configured `bonus_trigger_status` (default `approved`) and uses `withdrawal_bonus_rate_percent` exactly.
5. Confirm owner-fallback flag actually swaps helper visibility when CSA balance dips below threshold.
6. Add a small "Settings Sync Status" strip on the CSA Diamond Wallet page showing the live values pulled from admin (so any CSA can verify what owner configured).

Anything found broken → fixed in the same pass via migration + frontend edit.

---

## Part B — 6-Level Policy Hub (English, luxurious 3D)

### Levels covered
1. **L1 — Helper** (basic top-up agent)
2. **L2 — Verified Helper** (KYC done, higher cap)
3. **L3 — Senior Helper / Trader** (multi-country)
4. **L4 — Payroll Trader** (auto-payroll, commission tier)
5. **L5 — Country Payroll Admin** (regional finance lead)
6. **L6 — Country Super Admin (CSA)** — flagship, written in fine detail

### Structure
- New route: `/policies/levels` (hub) + `/policies/levels/:levelCode` (detail).
- Hub page renders 6 luxury cards in a bento layout with 3D banner artwork per level (image-gen, premium tier, gold/obsidian/sapphire theme matching admin console).
- Each detail page sections: Eligibility · Onboarding Requirements · Responsibilities · Tools & Dashboard Access · Earnings & Commission · Compliance & Conduct · Termination & Appeal · Contact & Escalation.
- CSA (L6) page extra sections: Diamond Wallet Operations (min purchase, diamonds/USD rate, visibility threshold, owner fallback, auto-credit, withdrawal bonus) — pulled live from `csa_diamond_settings` so the policy always matches what owner configured; Country-Level Authority; Sub-Admin Management; Payroll Oversight; Audit & Reporting; SLA & Uptime; Confidentiality.
- All copy in English. No Bangla strings in UI (per project rule).

### Design
- Reuse existing design tokens (no hardcoded colors). Dark luxury surface, gold accent, glassmorphism cards, subtle parallax on banners.
- 6 generated 3D banner images (premium quality) saved to `src/assets/policy-banners/`.

### Integration points
- **Email Broadcast composer**: add "Attach Policy Link" picker (inserts public policy URL into body).
- **Email Support / Helper Admin Messages**: footer auto-appends "See applicable policy: <link>" based on recipient's level.
- **Support Tickets**: ticket creation form shows a "Related Policy" inline link based on the user's current level; resolved tickets include the policy link in the closing message template.
- **Owner Admin Panel**: add "Policies" quick link → opens the hub for review.

### Storage
- Policy content lives in a new table `policy_documents (level_code, version, title, body_md, banner_asset, updated_at)` so owner can edit copy without a redeploy.
- Seed migration inserts v1 content for all 6 levels (English, drafted from the actual privileges already built in this project).
- Public read for `authenticated`; write restricted to owner via `current_admin_id_from_header()` RPC.

---

## Technical Section

- Migration: create `policy_documents` table + GRANTs + RLS + `admin_upsert_policy_document` RPC.
- Audit migration (only if Part A finds drift): patch CSA consumer RPCs to read live settings.
- New pages: `src/pages/policies/LevelsHub.tsx`, `src/pages/policies/LevelDetail.tsx`.
- New component: `src/components/policies/PolicyBanner.tsx` (3D banner with parallax).
- Email composer + ticket form receive a shared `<PolicyLinkPicker />`.
- Realtime: subscribe `policy_documents` so edits propagate instantly.

---

## Out of scope (will NOT touch)
- LiveKit / camera / gift / entry animation code (sacred).
- Existing AgencyPolicy.tsx copy (kept; new hub links to it for agency-side).
- Marketing / promotional email content (not allowed per platform rules).

---

## Deliverable order
1. Part A audit + fix (migration if needed).
2. `policy_documents` table + seed.
3. Hub + Detail pages + 6 banner images.
4. Email/Ticket integration.
5. Owner quick link + verification screenshot.

Approve and I'll execute end-to-end in one go.