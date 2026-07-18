# Admin Panel A→Z Master Plan (Pass 1 output — 2026-07-18)

> **Status:** Pass 0-A + Pass 0-B foundation shipped. Pass 1 = professional research + real-content 163-page audit. Below is the consolidated fix roadmap the next passes execute.
> **Sources:**
> - `docs/pro-admin-tokens-research.md` — Stripe / Vercel / Linear / Supabase Studio / Retool / Polaris / Notion tokens (14 dimensions, cited).
> - `/mnt/documents/admin-pass1-gap-audit.csv` — 169-route Playwright screenshot + DOM audit.
> - `/mnt/documents/admin-pass1-summary.md` — top offenders, network/console errors, access-denied surfaces.
> - Supabase `slow_queries` + `linter` scans.

---

## 0. Real gaps found (evidence, not opinion)

### Presentation
| Signal | Count / 169 routes | Interpretation |
|---|---|---|
| Neon-gradient borders detected | **167** | Cloud White violation is universal — every StatCard / hero band still ships legacy `from-*-500 to-*-500` borders. |
| Hardcoded white-on-white classes | 2 | Isolated; will be swept in the 15-section pass. |
| `text-[10px]/[11px]` tiny text | 0 | Pass 0-A CSS guard neutralized the reader. Legibility floor is holding. |
| Access-denied surfaces | 0 | Owner role hydrates correctly on every route. |
| Stuck-loading surfaces | 0 | No skeleton-forever bugs. |
| 4xx/5xx network requests | 0 | Admin data paths are wired. |
| Console errors | 1 route | Isolated — will be triaged in Pass 3 verification. |

**Interpretation:** The admin panel's *functionality* is largely fine. The gap is **visual system discipline** — neon gradients + legacy StatCard/Card treatments across 167 pages violate the Cloud White + soft-3D research spec.

### Backend hot-spots (from `supabase--slow_queries`)
| Query | Calls | Total ms | Root-cause hypothesis |
|---|---|---|---|
| `UPDATE profiles SET equipped_entry_name_bar_id` | **1,959,426** | 9,161,542 | Client re-equipping on every render/effect (React state loop). |
| `UPDATE swift_pay_topups SET last_polled_at` | **1,455,650** | 382,097 | **Polling loop** — violates Core rule "no polling in place of realtime." |
| `SELECT swift_pay_topups WHERE external_user_id` | **1,400,434** | 139,287 | Same polling storm. |
| `UPDATE profiles SET equipped_entrance_id, equipped_entry_banner_id` | 152,834 | 587,648 | Same equip-write loop family. |

**These are admin-adjacent, not the admin UI itself, but the admin `SwiftPay` and `Entry Effects` hubs read from these hot tables — fixing them makes the admin snappier too.**

### Linter
1,990 issues surfaced. Majority `INFO: RLS Enabled No Policy` (dead RLS on unused tables), plus several `ERROR: Security Definer View`. Full triage in Pass 5 (Security & DB hygiene) — none of these block user-visible functionality today.

---

## 1. Design token contract (locked, from research)

Full spec: `docs/pro-admin-tokens-research.md` §"Unified Cloud White + 3D adaptation".

Key tokens now live in `src/index.css` under `.admin-pro-shell` (Pass 0-B):
- **Surface:** canvas `#F8FAFC`, surface-1 `#FFFFFF`, surface-2 `#F1F5F9`, sunken `#E2E8F0`.
- **Ink:** primary `#0F172A`, secondary `#475569`, muted `#64748B`, disabled `#94A3B8`.
- **Accent:** electric blue `#2563EB` (default), `#1D4ED8` (hover), `#DBEAFE` (subtle bg).
- **Semantic status:** success `#16A34A`, warning `#D97706`, danger `#DC2626`, info `#0EA5E9` — always paired with the `-subtle-bg` tint (never solid fill for status pills).
- **Elevation:** `shadow-admin-sm/md/lg/xl` (multi-layer soft shadows, no dark drop).
- **Radius:** `sm 6` / `md 8` / `lg 12` / `xl 16` / `full` pill.
- **Typography:** Space Grotesk 500/600 headings, DM Sans 400/500 body, tabular-nums on data.

**Anti-patterns (banned):**
- Neon gradient borders (`from-*-500 via-*-500 to-*-500`).
- Dark backgrounds (`bg-slate-800/900`, `bg-black`, `bg-zinc-900`) on any admin page.
- `text-[10px]` / `text-[11px]` labels.
- Solid-color-fill status badges.
- Ring-glow inputs (`ring-blue-500/40`).

---

## 2. 15-section fix list (execution order for Pass 2 →)

Each section = one "hub" of the admin sidebar. Every section-fix bundles: (a) sweep pages under it, (b) migrate all StatCards to `AdminStatCard`, (c) migrate tables to shared table primitive, (d) enforce empty-state anatomy, (e) run screenshot re-audit.

| # | Section | Pages | Priority | Notes |
|---|---|---|---|---|
| 1 | **Dashboard** | 1 | ✅ done Pass 0-A | Verify after primitives land. |
| 2 | **Users & Profiles** | ~12 | 🔴 high | Highest traffic; heavy tables. |
| 3 | **Live / Streams / Party** | ~14 | 🔴 high | Multiple realtime lists; StatCard density high. |
| 4 | **Verification (face, ID, device)** | ~9 | 🔴 high | Timeline + retry-reason UI needs research-spec table + pill badges. |
| 5 | **Wallet, Recharge, SwiftPay, Crypto** | ~15 | 🔴 high | Also triggers swift_pay polling fix (backend hot-spot #2). |
| 6 | **Agencies & Commissions** | ~10 | 🟠 med | AgencyHub + CommissionCalculator. |
| 7 | **Coin Traders (P2P)** | ~6 | 🟠 med | AdminCoinTraderHub. |
| 8 | **Gifts & Animations (Entry Effects, Frames, Chat Bubbles, Beauty)** | ~14 | 🟠 med | Preview cards need Cloud-White treatment; equip-write hot-spot #1 originates here. |
| 9 | **Games (Providers, Leaderboard, Server, Settings)** | ~8 | 🟠 med | |
| 10 | **Notifications, Broadcast, Email, Push** | ~8 | 🟠 med | Composer + history table. |
| 11 | **Content Moderation (Chat Inspector, Contact Violations, Blocked, Auto Actions)** | ~10 | 🟠 med | |
| 12 | **App Settings & Config (Branding, Banners, App Version, Update Logs, Call Settings, Feature Levels, Allowed Links)** | ~14 | 🟢 low | Mostly forms. |
| 13 | **Rewards & Leaderboards (weekly, tiers, config)** | ~6 | 🟢 low | Already touched last week. |
| 14 | **Analytics, Cost Monitor, Country Distribution, Daily Digest, Error Logs** | ~10 | 🟢 low | Chart pages — need chart tokens fix. |
| 15 | **AI Studio, Blueprint, Automation, Auto Actions, Agent Dispatches** | ~8 | 🟢 low | Internal tools; least user-facing. |

**Batching rule:** each pass ships 3 sections + a re-audit run + zero-regression Playwright check on already-migrated sections.

---

## 3. Shared primitives to build before Pass 2

Already shipped (Pass 0-B):
- `src/components/admin/AdminStatCard.tsx` — Cloud White stat card with color-tinted icon chip, soft 3D shadow, tabular-nums number, uppercase muted label.
- `src/components/admin/AdminPageHeader.tsx` — refactored, backward-compat with legacy props.
- `.admin-pro-shell` token layer in `src/index.css`.
- Tailwind extensions: `shadow-admin-sm/md/lg/xl`, easing tokens.

Still to build (Pass 2, first turn):
1. **`AdminDataTable`** — 40px row, sticky header, hairline dividers, chevron sort, chip filter bar, 4-part empty state, virtualized (react-window) at >200 rows.
2. **`AdminStatusPill`** — tinted-bg + matching-dark-text (success/warning/danger/info/neutral variants).
3. **`AdminEmptyState`** — icon-chip + heading + body + CTA anatomy.
4. **`AdminSidebar` polish** — 240/64 collapse, filled-chip active state, uppercase section captions.
5. **`AdminModal` / `AdminDrawer`** — light backdrop scrim, `radius-xl`, `shadow-admin-lg`.
6. **`AdminInput` / `AdminSelect`** — clean-ring focus, no glow.

---

## 4. Backend hot-spot fixes (parallel track)

Independent of the 15-section sweep — will be handled during the section that reads the affected table:

- **[Section 8]** Kill the `equipped_entry_name_bar_id` and `equipped_entrance_id` write loops (client-side effect deps bug — inspect `EntryEffectPreview` / equip mutation hooks). Target: <1000 writes/day, not 2M.
- **[Section 5]** Replace `swift_pay_topups` polling with realtime channel subscription (`postgres_changes` on the row) — matches Core rule "never polling in place of realtime."
- **[Pass 5]** Supabase linter cleanup: audit `SECURITY DEFINER` views (rewrite as `SECURITY INVOKER` with proper RLS) + drop RLS on unused tables. Non-blocking.

---

## 5. Verification protocol (runs after every pass)

1. Playwright re-audit of migrated sections → new CSV → diff neon/tiny/white counts vs prior.
2. Manual owner-account walkthrough of 3 highest-traffic pages per section.
3. `supabase--slow_queries` snapshot to catch new N+1 or write-loop regressions.
4. Screenshot side-by-side (before/after) attached to plan.md pass log.

---

## Pass log

- **Pass 0-A** (done) — Dashboard StatCard/AlertCard Cloud-White + 3D conversion; tiny-text ban CSS guard.
- **Pass 0-B** (done) — `.admin-pro-shell` token layer, Tailwind shadow tokens, `AdminStatCard`, `AdminPageHeader` refactor, research doc landed.
- **Pass 1** (done, this file) — Professional research consolidated, 169-route Playwright audit, gap CSV + summary published, backend hot-spots identified, 15-section fix order locked.
- **Pass 2** (next) — Shared primitives (AdminDataTable / AdminStatusPill / AdminEmptyState / sidebar polish) + first 3 sections (Dashboard verification, Users & Profiles, Live/Streams/Party).
