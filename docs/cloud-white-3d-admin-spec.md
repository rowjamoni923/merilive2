# Meri Admin — "Cloud White + 3D" Design Token Spec
Research + implementable spec for a React + Tailwind + shadcn admin (163 pages).

---

## 1. Source Research

### 1.1 Stripe Dashboard
Source: https://docs.stripe.com/stripe-apps/style · https://stripe.design/ · https://designmd.cc/benchmarks/stripe
- **Color**: near-white canvas `#ffffff`/`#f8fafd`, neutral border `#e5edf5`, brand indigo `#533afd` used sparingly (links, primary actions), semantic green `#15be53` (success), semantic red for danger, foreground text near-black `#0a2540`/`#000` at ~90% not gray-400.
- **Type**: `sohne-var` (custom), 16px body baseline, tight tabular numerals on all financial figures (`font-variant-numeric: tabular-nums`).
- **Surfaces**: flat white canvas, raised cards with 1px border + very soft shadow, no heavy elevation — Stripe favors border-based separation over shadow-based.
- **Density**: table rows ~44-48px, sticky header, no zebra striping, right-aligned numeric columns.

### 1.2 Vercel Dashboard
Source: https://vercel.com/design (Geist) · public dashboard observation
- **Color**: pure black/white neutral scale (Geist scale gray-100…gray-1000), single accent (blue #0070f3 legacy / near-black primary now), semantic colors desaturated.
- **Type**: Geist Sans + Geist Mono for code/IDs, 13-14px base in dense admin views, weight 500 for labels.
- **Elevation**: extremely flat, 1px borders, shadow only on popovers/dropdowns (`0 4px 12px rgba(0,0,0,.08)`), hover = background tint not shadow.
- **Motion**: 150-200ms ease-out, subtle scale/opacity, no bounce.

### 1.3 Linear
Source: https://linear.app · https://github.com/marcus/marcus-skills/blob/main/skills/linear-design-patterns/references/linear-design-system.md
- **Color**: dark-first, near-black `#08090a`, surfaces stepped `#0f1011`→`#1c1c1f`; for light-mode equivalents apply same "one/two step" surface logic on white.
- **Type**: Inter, headline weight 510 (not 600/700) — deliberately restrained, avoids "marketing bold."
- **Spacing**: strict 4px base grid, 16-token size scale.
- **Motion**: 100-150ms micro-interactions, `cubic-bezier(0.16,1,0.3,1)` (ease-out-expo-ish) for panels/command palette, instant perceived response.

### 1.4 Supabase Studio
Source: https://github.com/supabase/supabase/blob/master/apps/studio/tailwind.config.ts · https://github.com/supabase/design-tokens/blob/main/tokens.json
- Tailwind config extends CSS-variable driven tokens (`--brand`, `--border-*`, `--background-*`) — same shadcn-style HSL variable convention we use.
- Spacing scale built from a `2` multiplier off a `4px` xs unit (`xs=4, sm=xs*2=8, md=sm*2=16…`) — clean 4/8pt system.
- Surface layers explicitly named `background-default / background-surface-100 / background-surface-200 / background-overlay-default` — direct precedent for our `--surface-1/2/3`.
- Dense data-grid (SQL editor, table editor): 32-36px row height, monospace for cell values, sticky first column for row selector.

### 1.5 Retool
Source: retool.com (product observation, no public token doc) — reference pattern only
- Ultra-dense tables: 28-32px rows, compact 12-13px type, borders on every cell (grid pattern) unlike Stripe/Vercel's borderless rows — used only for our densest data pages (logs, transactions).
- Filter bar pinned directly above table, chip-based active filters with an "x" to remove, "Clear all" text action.

### 1.6 Shopify Polaris
Source: https://polaris.shopify.com/design/colors/color-tokens · https://polaris.shopify.com/design/typography/typography-tokens
- Token-first architecture: never use raw hex in components, always semantic token (`color-bg-surface`, `color-text-critical`, etc.) — this is the pattern we replicate with shadcn CSS vars.
- Font scale follows T-shirt sizing tied to a shared size/line-height ratio table (e.g. `body-sm` 12/16, `body-md` 14/20, `heading-sm` 13/16 semibold, `heading-lg` 20/24).
- Full semantic set beyond primary success/warning/critical: also `info`, `magic` (AI), `caution` — good precedent for adding an `--info` token distinct from `--primary`.

### 1.7 Notion
Source: product observation (notion.so), no public design-token doc
- Content-heavy surfaces stay almost entirely achromatic; color reserved for tags/labels only, never for structural chrome.
- Generous line-height (1.5+) and comfortable measure for text blocks; sidebars use hover-only affordances (icons/actions appear on hover, not always visible) to reduce visual noise — pattern worth adopting for our sidebar row actions.

---

## 2. Cross-System Pattern Synthesis

| Pattern | Consensus |
|---|---|
| Canvas | Off-white/very light gray (`#fafbfc`-`#f8fafd`), not pure `#fff` for body canvas; cards are `#fff` (creates the "raised card on cloud canvas" 3D feel) |
| Accent | ONE saturated brand color, used only for primary actions/links/active states — never as decorative background wash |
| Elevation | Soft, multi-layer, low-opacity black shadows; borders do more separation work than shadow at low density |
| Density | Two row-height tiers: comfortable (44-48px, dashboards/lists) and compact (32-36px, logs/ledgers) |
| Numerals | Tabular-nums everywhere money/counts appear |
| Motion | 100-200ms, ease-out curves, opacity+translateY(2-4px) or scale(0.98→1), never bounce/spring for admin chrome |
| Hover affordances | Reveal row actions on hover instead of always-on icon clutter |

---

## 3. Meri Admin — "Cloud White + 3D" Token Spec

### 3.1 CSS Variables (HSL, shadcn-compatible)

```css
:root {
  /* Core surfaces */
  --background: 210 20% 98%;        /* cloud canvas, not pure white */
  --foreground: 222 24% 12%;        /* near-black, not slate-400 */
  --card: 0 0% 100%;
  --card-foreground: 222 24% 12%;
  --popover: 0 0% 100%;
  --popover-foreground: 222 24% 12%;

  /* Surface layering (Supabase-style) */
  --surface-1: 0 0% 100%;           /* raised card */
  --surface-2: 210 20% 97%;         /* nested panel / table header */
  --surface-3: 210 16% 93%;         /* hover / pressed / zebra */

  /* Borders */
  --border: 214 20% 90%;
  --border-strong: 214 16% 82%;
  --input: 214 20% 90%;
  --ring: 217 91% 60%;

  /* Brand / primary (single accent, blue — not purple/violet) */
  --primary: 217 91% 55%;
  --primary-foreground: 0 0% 100%;

  --secondary: 210 20% 95%;
  --secondary-foreground: 222 24% 18%;

  --muted: 210 20% 95%;
  --muted-foreground: 220 10% 40%;  /* min contrast target, not slate-400 */

  --accent: 210 20% 95%;
  --accent-foreground: 222 24% 12%;

  /* Semantic */
  --success: 152 60% 36%;
  --success-foreground: 0 0% 100%;
  --warning: 38 92% 48%;
  --warning-foreground: 24 40% 12%;
  --destructive: 0 72% 48%;
  --destructive-foreground: 0 0% 100%;
  --info: 217 91% 55%;
  --info-foreground: 0 0% 100%;

  --radius: 0.625rem; /* 10px base */

  /* Elevation — soft multi-layer depth, NO colored glow */
  --shadow-sm: 0 1px 2px 0 rgba(16,24,40,0.05);
  --shadow-md: 0 1px 2px 0 rgba(16,24,40,0.06), 0 4px 8px -2px rgba(16,24,40,0.06);
  --shadow-lg: 0 2px 4px -1px rgba(16,24,40,0.06), 0 8px 16px -4px rgba(16,24,40,0.08);
  --shadow-xl: 0 4px 8px -2px rgba(16,24,40,0.06), 0 16px 32px -8px rgba(16,24,40,0.10);
  --shadow-inset: inset 0 1px 0 0 rgba(255,255,255,0.6), inset 0 -1px 0 0 rgba(16,24,40,0.04);
}

.dark {
  --background: 222 24% 8%;
  --foreground: 210 20% 96%;
  --card: 222 22% 11%;
  --surface-1: 222 22% 11%;
  --surface-2: 222 20% 14%;
  --surface-3: 222 18% 18%;
  --border: 222 16% 20%;
  --border-strong: 222 14% 28%;
  --muted-foreground: 215 12% 65%;
  --shadow-sm: 0 1px 2px 0 rgba(0,0,0,0.4);
  --shadow-md: 0 2px 6px -1px rgba(0,0,0,0.45);
  --shadow-lg: 0 8px 20px -4px rgba(0,0,0,0.5);
  --shadow-xl: 0 16px 40px -8px rgba(0,0,0,0.55);
}
```

### 3.2 Tailwind Extensions

```js
// tailwind.config.ts (extend)
extend: {
  fontFamily: {
    sans: ["Inter var", "Inter", "system-ui", "sans-serif"],
    mono: ["JetBrains Mono", "ui-monospace", "monospace"],
  },
  fontSize: {
    xs:   ["0.75rem",  { lineHeight: "1rem" }],      // 12/16 — labels only, never body
    sm:   ["0.8125rem",{ lineHeight: "1.25rem" }],   // 13/20 — dense table body
    base: ["0.875rem", { lineHeight: "1.375rem" }],  // 14/22 — default body
    md:   ["0.9375rem",{ lineHeight: "1.5rem" }],    // 15/24 — comfortable body
    lg:   ["1.0625rem",{ lineHeight: "1.625rem" }],  // 17/26 — h4
    xl:   ["1.25rem",  { lineHeight: "1.75rem" }],   // 20/28 — h3
    "2xl":["1.5rem",   { lineHeight: "2rem" }],      // 24/32 — h2
    "3xl":["1.875rem", { lineHeight: "2.25rem" }],   // 30/36 — h1
  },
  spacing: { 4.5: "1.125rem", 13: "3.25rem", 15: "3.75rem", 18: "4.5rem" }, // 4pt fills
  borderRadius: {
    sm: "calc(var(--radius) - 6px)",
    md: "calc(var(--radius) - 3px)",
    lg: "var(--radius)",
    xl: "calc(var(--radius) + 6px)",
  },
  boxShadow: {
    sm: "var(--shadow-sm)", md: "var(--shadow-md)",
    lg: "var(--shadow-lg)", xl: "var(--shadow-xl)",
    inset: "var(--shadow-inset)",
  },
  transitionDuration: { 100: "100ms", 200: "200ms", 300: "300ms" },
  transitionTimingFunction: {
    "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
    "out-soft": "cubic-bezier(0.4, 0, 0.2, 1)",
  },
}
```

Font weights: 400 body, 500 labels/table headers/nav, 600 h3/h4, 650-700 h1/h2 stat numbers (avoid 800/900 — reads as marketing, per Linear).

Tabular numerals utility: add `.tabular-nums` (Tailwind built-in) to every money/count/ID cell.

### 3.3 Component Anatomy (exact class strings)

**StatCard / KPI tile**
```html
<div class="rounded-lg border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow duration-200">
  <div class="flex items-center justify-between">
    <span class="text-sm font-medium text-muted-foreground">Total Revenue</span>
    <span class="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
      <!-- icon 16px -->
    </span>
  </div>
  <div class="mt-3 flex items-baseline gap-2">
    <span class="text-2xl font-semibold tabular-nums text-foreground">$128,430</span>
    <span class="inline-flex items-center gap-1 text-xs font-medium text-success">
      <!-- up arrow icon --> +12.4%
    </span>
  </div>
  <p class="mt-1 text-xs text-muted-foreground">vs. previous 30 days</p>
</div>
```

**DataTable**
```html
<div class="overflow-hidden rounded-lg border border-border bg-card">
  <table class="w-full text-sm">
    <thead class="bg-surface-2 border-b border-border">
      <tr class="h-11">
        <th class="sticky left-0 bg-surface-2 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</th>
        <th class="px-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground tabular-nums">Amount</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      <tr class="h-12 hover:bg-surface-2/60 transition-colors duration-150">
        <td class="sticky left-0 bg-card px-4 font-medium text-foreground">Row label</td>
        <td class="px-4 text-right tabular-nums text-foreground">$1,204.00</td>
      </tr>
    </tbody>
  </table>
</div>
```
Row height: 44-48px comfortable / 32-36px compact (`h-9`) for logs/ledgers. No zebra by default; use `odd:bg-surface-2/40` only on compact dense tables (Retool pattern).

**Sidebar item**
```html
<a class="group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground
          hover:bg-surface-2 hover:text-foreground
          data-[active=true]:bg-primary/10 data-[active=true]:text-primary
          transition-colors duration-150">
  <Icon class="h-4 w-4 shrink-0" />
  <span class="truncate">Users</span>
  <span class="ml-auto hidden group-hover:flex text-xs text-muted-foreground">⌘K</span>
</a>
```

**PageHeader**
```html
<div class="flex items-center justify-between border-b border-border pb-4">
  <div>
    <h1 class="text-2xl font-semibold text-foreground">Withdrawals</h1>
    <p class="mt-1 text-sm text-muted-foreground">Manage payout requests and settlement status.</p>
  </div>
  <div class="flex items-center gap-2"><!-- actions --></div>
</div>
```

**EmptyState**
```html
<div class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
  <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
    <Icon class="h-5 w-5" />
  </div>
  <h3 class="text-sm font-semibold text-foreground">No transactions yet</h3>
  <p class="mt-1 max-w-sm text-sm text-muted-foreground">Transactions will appear here once a payout is processed.</p>
  <button class="mt-4 btn-primary">Create manual payout</button>
</div>
```

**Badge / Chip variants**
```html
<span class="inline-flex items-center rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">Active</span>
<span class="inline-flex items-center rounded-full bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">Pending</span>
<span class="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">Blocked</span>
<span class="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Draft</span>
<span class="inline-flex items-center rounded-full bg-info/10 px-2.5 py-0.5 text-xs font-medium text-info">Info</span>
```

**Buttons**
```html
<!-- Primary -->
<button class="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 active:translate-y-px transition-all duration-150">Save changes</button>
<!-- Secondary -->
<button class="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground shadow-sm hover:bg-surface-2 transition-colors duration-150">Cancel</button>
<!-- Ghost -->
<button class="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors duration-150">View</button>
<!-- Destructive -->
<button class="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground shadow-sm hover:bg-destructive/90 transition-colors duration-150">Delete</button>
```

**Filter bar**
```html
<div class="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
  <input class="h-8 w-56 rounded-md border border-border bg-transparent px-2.5 text-sm" placeholder="Search..." />
  <button class="h-8 rounded-md border border-dashed border-border px-2.5 text-xs font-medium text-muted-foreground hover:bg-surface-2">+ Status</button>
  <span class="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs">Status: Active <button class="text-muted-foreground">×</button></span>
  <button class="ml-auto text-xs font-medium text-muted-foreground hover:text-foreground">Clear all</button>
</div>
```

**Pagination**
```html
<div class="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
  <span>Showing <span class="tabular-nums font-medium text-foreground">1-20</span> of <span class="tabular-nums font-medium text-foreground">4,382</span></span>
  <div class="flex items-center gap-1">
    <button class="h-8 w-8 rounded-md border border-border hover:bg-surface-2 disabled:opacity-40">‹</button>
    <button class="h-8 w-8 rounded-md border border-border hover:bg-surface-2">›</button>
  </div>
</div>
```

**Toast**
```html
<div class="flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-lg">
  <span class="mt-0.5 h-2 w-2 rounded-full bg-success"></span>
  <div>
    <p class="text-sm font-medium text-foreground">Payout processed</p>
    <p class="text-xs text-muted-foreground">$4,200.00 sent to host wallet.</p>
  </div>
</div>
```

**Modal**
```html
<div class="fixed inset-0 bg-foreground/40 backdrop-blur-[2px]">
  <div class="mx-auto mt-24 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200">
    <h2 class="text-lg font-semibold text-foreground">Confirm action</h2>
    <p class="mt-1 text-sm text-muted-foreground">This cannot be undone.</p>
    <div class="mt-6 flex justify-end gap-2"><!-- buttons --></div>
  </div>
</div>
```

### 3.4 Motion Tokens
| Token | Value | Use |
|---|---|---|
| `duration-100` | 100ms | icon/text color flips, checkbox toggle |
| `duration-150` | 150ms | hover bg, sidebar item, table row hover |
| `duration-200` | 200ms | button press, tooltip, dropdown open |
| `duration-300` | 300ms | modal/sheet enter-exit, page transition |
| `ease-out-soft` | `cubic-bezier(0.4,0,0.2,1)` | default UI easing |
| `ease-out-expo` | `cubic-bezier(0.16,1,0.3,1)` | panels/command palette (Linear) |
| hover-lift | `hover:shadow-md hover:-translate-y-0.5` | cards only, never buttons/rows |

---

## 4. Anti-Patterns — Remove From Current Admin
- ❌ Neon/gradient accents (`bg-gradient-to-r from-purple-500 to-pink-500`) on chrome/buttons
- ❌ Purple/violet as primary accent on white canvas — reads as generic AI-SaaS template, not financial-grade
- ❌ `text-[10px]` / any arbitrary sub-12px type — min UI text is `text-xs` (12px), body is 13-14px
- ❌ `text-slate-400`/`text-gray-400` for body/label text on white — fails contrast, replace with `text-muted-foreground` tuned to ≥4.5:1
- ❌ Gradient border wrappers (`p-[1px] bg-gradient-to-r ... rounded-xl` hack) — use solid 1px `border-border`
- ❌ Colored glow shadows (`shadow-[0_0_20px_rgba(139,92,246,0.5)]`) — replace with neutral multi-layer `--shadow-md/lg`
- ❌ Overuse of `rounded-2xl`/`rounded-3xl` on small controls — cap radius at `rounded-lg` (10px) except large modals/sheets
- ❌ All-caps bold headers with letterspacing on everything — reserve uppercase tracking for table headers/eyebrow labels only
- ❌ Inconsistent icon sizing (16/18/20/24 mixed per page) — standardize 16px inline, 20px section icons
- ❌ Full-saturation semantic fills (`bg-red-500` text badges) — use `/10` tint + solid text color instead

---

## 5. Per-Section Gap Checklist (template)

| Route | Status | Data-binding OK? | Contrast OK? | Uses new tokens? | Perf (virtualized/paginated)? | Notes |
|---|---|---|---|---|---|---|
| /dashboard | needs-audit | | | | | |
| /users | needs-audit | | | | | |
| /hosts | needs-audit | | | | | |
| /agencies | needs-audit | | | | | |
| /csa-country-admin | needs-audit | | | | | |
| /helpers | needs-audit | | | | | |
| /traders | needs-audit | | | | | |
| /recharge-payments | needs-audit | | | | | |
| /withdrawals | needs-audit | | | | | |
| /live-party-calls | needs-audit | | | | | |
| /verifications | needs-audit | | | | | |
| /content-gifts-frames | needs-audit | | | | | |
| /rewards-leaderboard | needs-audit | | | | | |
| /notifications-broadcast | needs-audit | | | | | |
| /settings-system | needs-audit | | | | | |

Instructions for filling: duplicate one row per actual page under each hub (163 total); mark Status as `needs-audit → in-progress → done`; Perf column should call out tables >200 rows lacking pagination/virtualization.

---

## Sources
- https://docs.stripe.com/stripe-apps/style
- https://stripe.design/
- https://designmd.cc/benchmarks/stripe
- https://vercel.com/design
- https://linear.app
- https://github.com/marcus/marcus-skills/blob/main/skills/linear-design-patterns/references/linear-design-system.md
- https://github.com/supabase/supabase/blob/master/apps/studio/tailwind.config.ts
- https://github.com/supabase/design-tokens/blob/main/tokens.json
- https://polaris.shopify.com/design/colors/color-tokens
- https://polaris.shopify.com/design/typography/typography-tokens
- retool.com, notion.so (direct product observation, no public token docs)
