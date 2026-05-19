# Helper Dashboard Premium Redesign — Full Audit & Fix

## Goal

`HelperDashboard` (Level 1-4) এবং `Level5HelperDashboard` — দুটোতেই
1. **Premium text & color** — app-এর Ultra-Premium 3D Luxurious aesthetic (dark surfaces + gold/amber accents + emerald earnings) এর সাথে match করানো।
2. **প্রত্যেকটা button / action সঠিকভাবে কাজ করছে কিনা** verify + fix।

কোনো business logic বদলাবো না — শুধু presentation layer + broken handlers।

---

## Scope

### File A — `src/pages/HelperDashboard.tsx` (2,422 lines, Level 1-4)
Sections to upgrade:
- Header / hero stats (Trader Wallet, My Diamonds, Total Earned, Today's Earnings)
- Manual Top-up card (auto crypto gateway block)
- Level progression card (Level 1 → Level 5)
- Upgrade Application modal (Crown dialog)
- Payroll Application section (Apply / Pending / Rejected / Approved states)
- 3-Tab section (`user` / `agency` / `self`) — TabsList + each TabsContent
- Upgrade requests history list

### File B — `src/pages/Level5HelperDashboard.tsx` (3,624 lines)
Sections to upgrade:
- Header + balance/earnings KPIs
- Withdrawal request card + history table
- Order management section
- Performance / weekly earnings widgets
- All dialogs & toasts

---

## Design system (locked across both files)

| Token | Value (Tailwind / hex) | Used for |
|---|---|---|
| Base surface | `bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950` | Page background |
| Card surface | `bg-slate-900/60 backdrop-blur-xl border border-amber-500/20` | All cards |
| Premium card surface | `bg-gradient-to-br from-slate-900 via-slate-800/80 to-slate-900 border-amber-400/30 shadow-[0_8px_32px_rgba(0,0,0,0.4)]` | Hero/stat cards |
| Heading text | `text-amber-100` / gold gradient `bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-400` | Section titles |
| Body text | `text-slate-200` | Primary readable text |
| Muted text | `text-slate-400` | Labels, hints |
| Earnings / money | `text-emerald-300` + `text-amber-300` for diamonds | Diamonds, Beans, USD |
| Primary CTA | `bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 text-slate-950 font-bold shadow-[0_4px_20px_rgba(245,158,11,0.4)]` | Main actions (Pay, Apply) |
| Secondary | `Button variant="glass"` (already in `button.tsx`) | Cancel, secondary |
| Outline | `Button variant="outline-premium"` | Tertiary |
| Danger | `bg-red-500/10 border border-red-500/40 text-red-300` | Rejected states |
| Success | `bg-emerald-500/10 border border-emerald-500/40 text-emerald-300` | Approved states |
| Info | `bg-amber-500/10 border border-amber-500/40 text-amber-200` | Pending |

> Existing `luxury`, `glass`, `outline-premium` button variants (per memory `mem://design/premium-button-variants-and-readability`) will be reused — না বানিয়ে already আছে।

---

## Functional fixes to verify

For each interactive element I will trace handler → confirm it does what its label says:

### HelperDashboard.tsx
1. **Apply for Level 5** → opens upgrade modal ✓ already wired
2. **Pay with Crypto** (modal) → opens `SwiftPayDepositModal`, on `onCredited` inserts `helper_upgrade_requests` ✓ verify
3. **Apply for Payroll Access** → `setShowPayrollModal(true)` ✓ verify modal still renders
4. **Re-apply for Payroll Access** → same modal, rejected state ✓ verify
5. **Open Level 5 Dashboard** → `navigate('/level5-helper-dashboard')` ✓ verify route exists
6. **TabsTrigger user/agency/self** → check each TabsContent fully renders (user reported earlier "General click korle properly kaj kortese na")
7. **Manual Top-up "Generate"** → wired in earlier patch ✓ verify still working after redesign
8. **Cancel buttons** in all dialogs → `setShow*(false)` — verify

### Level5HelperDashboard.tsx
1. Withdrawal request form → submits to correct RPC
2. Order accept/reject buttons → mutation handlers
3. Tab navigation works
4. All "Copy", "Download", "Refresh" icons have handlers

If any handler is missing or broken, fix it in the same pass.

---

## Approach (sequential, low-risk)

```text
Step 1: HelperDashboard.tsx — outer page wrapper + header (10 min)
Step 2: HelperDashboard.tsx — Manual Top-up + Levels card (10 min)
Step 3: HelperDashboard.tsx — Upgrade modal + Payroll states (10 min)
Step 4: HelperDashboard.tsx — Tabs section (user/agency/self) + handler audit (15 min)
Step 5: Level5HelperDashboard.tsx — header + KPIs (10 min)
Step 6: Level5HelperDashboard.tsx — withdrawal + orders + dialogs (15 min)
Step 7: Click-through verification — open every dialog, switch every tab, confirm no broken handler
```

Each step = focused `code--line_replace` patches (no full rewrites of 6k-line files).

---

## Out of scope (explicitly NOT touching)

- Financial logic (host%, beans→USD, withdrawal minimums) — per immutability memory
- Database / RPCs / edge functions
- Authentication / routing
- Other pages (Recharge, Agency, etc.)
- Bengali strings (memory: English-only UI)

---

## Risk

Low. Pure presentation + bug-fix pass. No schema, no API, no money math touched. If any redesign hides a working button accidentally, click-through verification step catches it before finishing.

---

approve করলে শুরু করি — sequential ভাবে patch করবো, প্রতি step-এর পর verify।