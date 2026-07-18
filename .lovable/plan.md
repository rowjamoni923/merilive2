# Meri Admin Panel — A→Z Professional Audit Plan
Locked: 2026-07-18 (Pass 0-B research complete)

Reference spec: `docs/cloud-white-3d-admin-spec.md` (Stripe / Vercel / Linear / Supabase Studio / Retool / Polaris / Notion synthesis).

---

## Status
- ✅ Pass 0-A — Dashboard StatCard/AlertCard rebuilt to Cloud White + soft 3D (accent bar + tinted icon chip, no neon gradient, no `text-[10px]`).
- ✅ Pass 0-B — Competitor research + unified token spec written to `docs/cloud-white-3d-admin-spec.md`.
- ⏳ Pass 1 — Token migration + per-section audit (below).

---

## Pass 1 Execution Order

### 1. Token foundation (single PR, no visual regression risk)
- Migrate `src/index.css` `:root` block to the spec's HSL variables (adds `--surface-1/2/3`, `--border-strong`, `--info`, canvas off-white `210 20% 98%`, `--muted-foreground 220 10% 40%` for ≥4.5:1).
- Extend `tailwind.config.ts` with type scale, `spacing 4.5/13/15/18`, `boxShadow sm/md/lg/xl/inset` bound to CSS vars, `ease-out-soft` / `ease-out-expo`.
- Ban `text-[10px]`, colored glow, gradient border wrappers via ESLint rule OR a one-shot rg audit + rewrite pass.

### 2. Shared admin primitives (one file each, rest of panel inherits)
- `src/components/admin/AdminStatCard.tsx` — canonical anatomy per spec §3.3 (used by every hub).
- `src/components/admin/AdminDataTable.tsx` — 44/32 row-height variants, sticky header, tabular-nums, hover-reveal actions.
- `src/components/admin/AdminPageHeader.tsx` — title + subtitle + actions slot.
- `src/components/admin/AdminEmptyState.tsx`, `AdminFilterBar.tsx`, `AdminBadge.tsx` variants.
- Replace `AdminLuxuryStatCard`, gradient `AdminCard3D` usages progressively.

### 3. Per-hub sweep (15 hubs, batched — 3 per turn per project rule)
Fill this table as we go; one row per real route (163 total). Duplicate rows under each hub during the batch.

| Hub | Status | Data OK | Contrast OK | New tokens | Perf | Notes |
|---|---|---|---|---|---|---|
| Dashboard | in-progress | ✅ | ✅ (Pass 0-A) | partial | ✅ | header/sidebar still legacy |
| Users | needs-audit | | | | | |
| Hosts | needs-audit | | | | | |
| Agencies | needs-audit | | | | | |
| CSA / Country Admin | needs-audit | | | | | |
| Helpers | needs-audit | | | | | |
| Traders | needs-audit | | | | | |
| Recharge / Payments | needs-audit | | | | | |
| Withdrawals | needs-audit | | | | | |
| Live / Party / Calls | needs-audit | | | | | |
| Verifications | needs-audit | | | | | |
| Content / Gifts / Frames | needs-audit | | | | | |
| Rewards / Leaderboard | needs-audit | | | | | |
| Notifications / Broadcast | needs-audit | | | | | |
| Settings / System | needs-audit | | | | | |

Per-page acceptance = all 4 columns ✅ + Playwright screenshot at 1280×1800 attached to the row.

### 4. Anti-pattern purge (rg-driven)
- `rg "text-\[10px\]" src/pages/admin src/components/admin`
- `rg "bg-gradient-to.*(purple|violet|pink|fuchsia)" src/pages/admin src/components/admin`
- `rg "shadow-\[.*rgba\(.*\)\]" src/pages/admin src/components/admin`
- `rg "text-(slate|gray)-400" src/pages/admin src/components/admin` (body/label positions only)
- Every hit → replace with semantic token from spec.

### 5. Perf pass (real, not cosmetic)
- Any admin list rendering >200 rows without pagination/virtualization → wrap in `TanStackVirtual` or add server-side `range()` pagination.
- Replace `setInterval` polling with `useAdminRealtime` (already exists) — audit calls to any `setInterval` in `src/pages/admin`.
- Confirm every heavy page uses the `instantRestCache` pattern (cached first paint, then live refresh).

### 6. Verification loop (each batch)
1. Playwright login as owner → screenshot each touched route at 1280×1800.
2. `code--view` screenshots → confirm contrast + no white-on-white.
3. Only mark row `done` after visual + data + perf all green.

---

## Anti-Patterns (from spec §4 — non-negotiable)
Neon gradients · purple/violet primary · `text-[10px]` · slate-400 body · gradient border wrappers · colored glow shadows · `rounded-2xl/3xl` on controls · full-saturation semantic fills · inconsistent icon sizing.

---

## Rules (locked)
- Research-first still applies to every new pass (competitor citation before code).
- English-only UI strings (national app).
- Admin panel = single source of truth (no hardcoded numbers).
- Cloud White + 3D + zero-lag budget stays in force.
