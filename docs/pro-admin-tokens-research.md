# Pro Admin Design Tokens & UI Pattern Research

Research pass across seven reference products (Stripe Dashboard, Vercel Dashboard/Geist, Linear, Supabase Studio, Retool, Shopify Polaris, Notion) covering color, type, spacing, elevation, and component conventions used in "pro" SaaS/admin surfaces. Sources are official docs/design systems where public, or third-party measured specimens where the product has no public token API (Stripe, Linear, Notion apps are closed-source; values below are reverse-engineered/community-measured and should be treated as approximations, clearly marked).

---

## 1. Shopify Polaris (official, public design system)

**Source:** [polaris-react.shopify.com/tokens/color](https://polaris-react.shopify.com/tokens/color), [.../tokens/space](https://polaris-react.shopify.com/tokens/space), [.../tokens/border](https://polaris-react.shopify.com/tokens/border), [polaris.shopify.com/design/colors/color-tokens](https://polaris.shopify.com/design/colors/color-tokens)

- **Surface/background:** `--p-color-bg: rgba(241,241,241,1)` (page canvas, light grey), `--p-color-bg-surface: rgba(255,255,255,1)` (card/element surfaces), `--p-color-bg-inverse: rgba(26,26,26,1)` (high-contrast bands).
- **Text:** semantic tokens `--p-color-text` (near-black), `--p-color-text-secondary`, `--p-color-text-disabled`, `--p-color-text-inverse` — Polaris intentionally hides raw hex behind semantic names so theming can shift globally.
- **Accent/brand:** interactive/primary uses Shopify green family (`--p-color-bg-fill-brand`, success/critical/warning/info semantic scales — no raw hex published, token-abstracted by design).
- **Borders:** `--p-color-border`, `--p-color-border-secondary` (hairline greys), width tokens `--p-border-width-0165/025/050/100`.
- **Radii scale:** `--p-border-radius-0, 050, 100, 150, 200, 300, 400, 500, 750, full` — i.e. 0/2/4/6/8/12/16/20/30px/pill. Cards commonly use 200–300 (8–12px).
- **Spacing scale (4px base, non-linear beyond 16):** 0, 1, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 112, 128px. Special aliases: `--p-space-card-padding: 16px`, `--p-space-card-gap: 16px`, `--p-space-table-cell-padding: 6px`.
- **Table conventions:** dense 6px cell padding by default (IndexTable component), sortable column headers, sticky header on scroll, bulk-selection checkbox column, zebra striping is *not* default (relies on hairline row dividers instead), empty state uses Polaris `EmptyState` component (illustration + heading + body + primary action).
- **Badges:** `Badge` component — pill radius (full), fixed small/medium sizing, semantic tones (success/info/attention/critical/new) mapped to token backgrounds, never raw colored text without a tinted background.

---

## 2. Vercel Dashboard — Geist Design System (official, public)

**Source:** [vercel.com/geist/colors](https://vercel.com/geist/colors), [vercel.com/geist/materials](https://vercel.com/geist/materials), [vercel.com/design.md](https://vercel.com/design.md) (design-token export)

- **Surface/background scale:** two background layers — **Background 1** (default page/element bg) and **Background 2** (secondary, sparing use for subtle differentiation). Component backgrounds use a 3-step **Color 1/2/3** ramp = default / hover / active, so hover and active states are token-defined rather than opacity hacks.
- **Color system:** 10 scales total — `backgrounds, gray, gray-alpha, blue, red, amber, green, teal, purple, pink`. Each non-background scale has **10 steps (100→1000)** with fixed semantic roles:
  - 100 = default bg, 200 = hover bg, 300 = active bg, 400 = subtle border, ~500-600 = normal border/solid, 700-800 = "hover solid" text-safe accents, 900-1000 = high-contrast text/icon.
  - P3 wide-gamut colors used on supported displays; values documented as sRGB hex + P3 equivalents.
- **Elevation ("Materials"):** presets rather than raw shadow values —
  - Surface: `material-base` (radius 6px, everyday), `material-small` (6px, slightly raised), `material-medium`/`material-large` (12px, further raised).
  - Floating: `material-tooltip` (lightest shadow, 6px corner), `material-menu` (lift from page), plus presumably `material-modal` for heaviest elevation.
- **Radii:** 6px (base/small components), 12px (medium/large surfaces like cards/modals) — a deliberately small, tight radius scale vs. consumer apps.
- **Typography:** Geist Sans + Geist Mono (Vercel's own open-source font family, monospace used heavily for data/numbers/timestamps in dashboard tables).
- **Philosophy quote (from official docs):** "minimal and high-contrast: plenty of whitespace, restrained color, and content set on near-neutral surfaces... use color to signal state or hierarchy rather than decoration."
- **Sidebar/nav pattern (observed):** icon+label vertical nav, collapsible sections per-team/project, active item indicated by filled background chip (Color 2/3) not a colored bar.

---

## 3. Linear (closed-source app; community-measured specimen)

**Source:** [Linear Brand Guidelines](https://linear.app/brand) (official, brand-only); token values via third-party specimen extraction: [designmd.cc/benchmarks/linear](https://designmd.cc/benchmarks/linear), [duply.ai/linear/design-md](https://duply.ai/linear/design-md) — **note: not an official token API, treat hex values as approximate/measured, not guaranteed stable.**

- **Canvas:** near-black `#08090a` (marketing), deeper `#010102` on hero bands; app UI in dark mode layers graphite surfaces `#1c1c1f → #28282c` with translucent white overlays for elevation instead of shadows.
- **Accent:** signature indigo/violet `#5e6ad2` (primary brand/active), plus `#6366f1`, `#8b5cf6` in extracted palette; red `#eb5757` for destructive/priority-urgent.
- **Hairline borders:** `#e5e5e6`-class light hairlines (app also ships a light theme); dark-mode borders are near-invisible until hover to keep the UI "quiet."
- **Typography:** **Inter Variable** exclusively, tuned to custom variable-font weight axis values (~510 "medium," ~590 "semibold") rather than standard 500/600 — a hallmark of Linear's crisp, slightly-condensed label type. Base size ~16px, but UI chrome (sidebar, table rows) commonly drops to 13px.
- **Row/list conventions (widely documented via community + product usage):** dense 32–36px issue-list row height, no zebra striping, single hairline divider between rows, left-edge colored priority/status dot (not a filled badge) as a lightweight status signal, keyboard-first inline filters rendered as small rounded "chips" above the list.
- **Design ethos:** hierarchy built from layers of faint light and hairline borders rather than heavy shadows/saturated color — directly informs a "quiet chrome, confident single accent" approach.

---

## 4. Supabase Studio (open source, real Tailwind config)

**Source:** [github.com/supabase/supabase — apps/studio/tailwind.config.ts](https://github.com/supabase/supabase/blob/master/apps/studio/tailwind.config.ts) and shared `config/tailwind.config` package (actual production Tailwind theme, fully public).

- **Architecture:** Studio doesn't hardcode a palette in-app; it imports a **shared internal `tailwind.config` package** used across all Supabase apps (Studio, docs, marketing) so tokens are consistent monorepo-wide. As of 2024–2025 they migrated from JS token config to **CSS custom-property-based Tailwind config** (PR #45686), i.e. `--color-*` CSS vars consumed via `theme()`/`@theme`.
- **Semantic naming pattern:** Supabase's design tokens follow a `background / background-surface-{100,200,300} / foreground / foreground-light / foreground-lighter / border / border-muted / border-strong` naming convention (visible across their public Tailwind + UI library `supabase/ui` docs), i.e. numbered surface elevation steps rather than raw grays — good precedent for a light-canvas surface ramp.
- **Brand accent:** Supabase green (`#3ECF8E`-family) reserved for primary actions/brand marks; UI chrome otherwise neutral gray/slate scale so the product accent doesn't fight with data-heavy tables.
- **Table conventions (Studio's SQL/Table editor, observed product behavior):** monospace cell font for data grids, sticky header row, resizable/reorderable columns, row height ~34–40px, alternating-row zebra is off by default (uses hover-row highlight + column-divider borders instead), inline type-badges per column (e.g. `int8`, `text`, `timestamptz`) styled as tiny monospace pills in the header.
- **Radii/spacing:** inherits standard Tailwind scale (radius `sm 2px / md 6px / lg 8px / xl 12px`, 4px spacing base) per their shared Tailwind preset.

---

## 5. Stripe Dashboard (closed-source; official component-styling docs + measured specimen)

**Source:** [docs.stripe.com/stripe-apps/style](https://docs.stripe.com/stripe-apps/style) (official — Stripe Apps design tokens, meant to let third-party UI match Dashboard), specimen data: [designmd.cc/benchmarks/stripe](https://designmd.cc/benchmarks/stripe), overview: [designsystems.one/design-systems/stripe-design](https://www.designsystems.one/design-systems/stripe-design)

- **Official pattern:** Stripe exposes Dashboard-matching styling only through **semantic design tokens** consumed by `Box`/`Inline` components in Stripe Apps (no raw palette is public) — reinforces the "semantic token, not raw hex" convention seen across Polaris/Vercel/Supabase.
- **Measured palette (community, approximate):** canvas white `#ffffff`, very pale blue-tinted surfaces `#f8fafd` / `#e5edf5` (card/table zebra tint), brand purple/violet `#533afd` (primary actions/links), green `#15be53` (success/positive amounts), soft violet/pink tints `#e2e4ff` / `#ffe0ef` for badge backgrounds, ink `#000000`-adjacent near-black text.
- **Typography:** proprietary `sohne-var` (Söhne) variable font — geometric-grotesque, tight letterspacing, base 16px.
- **Table conventions (observed):** financial/data tables use right-aligned monospace-tabular numerals, subtle zebra via the pale blue tint above, sticky header, row-hover affordance revealing a "..." actions menu, status shown via small tinted pill badges (not colored text) — e.g. green pill "Succeeded," gray pill "Refunded," red-tinted pill "Failed."
- **Elevation:** very soft/low-contrast shadows (1–2px blur, near-white ambient) — Stripe favors border+tint separation over strong drop shadows, consistent with a "flat but layered" aesthetic.

---

## 6. Retool (component library; official blog + measured specimen)

**Source:** [retool.com/blog/redesigned-ui-component-library](https://retool.com/blog/redesigned-ui-component-library) (official, 90+ component rebuild announcement), token specimen: [oh-my-design.kr/design-systems/retool](https://oh-my-design.kr/design-systems/retool)

- **Brand/accent:** primary `#E0613A` (warm orange-red) — a deliberately warm, non-blue accent to differentiate from the sea of blue B2B tools.
- **Typography:** **Inter** for UI text, **IBM Plex Mono** for code/data values — dual-stack pattern (humanist sans + mono for numbers/code) common to internal-tool/admin builders.
- **Radius:** notably large 16px corner radius on components — more "friendly/rounded" than Vercel/Linear's tight 6–8px, reflecting Retool's builder/no-code audience rather than a dense pro terminal feel.
- **Table conventions (product behavior, widely documented in Retool community docs):** column type formatting badges/tags for data cells (currency, date, percent, tag types get inline pill rendering), inline row action buttons revealed on hover, striped/zebra rows optional per-component toggle (not force-enabled), frozen/sticky first column and header row support built into the Table component config.
- **Philosophy (from official blog):** component library optimized specifically for **internal tools/business apps** — density and configurability prioritized over marketing polish, e.g. every component ships dense + comfortable sizing variants.

---

## 7. Notion (closed-source; official brand notes + measured specimen)

**Source:** specimen data: [designmd.cc/benchmarks/notion](https://designmd.cc/benchmarks/notion), analysis: [getdesign.md/design-md/notion/preview](https://getdesign.md/design-md/notion/preview), community DESIGN.md: [github.com/VoltAgent/awesome-design-md — notion](https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/notion/DESIGN.md)

- **Canvas:** warm, paper-calm **off-white** `#ffffff`/`#f6f5f4`/`#f0efed` (not stark white — slightly warm-grey undertone), near-black Inter-based text `#02093a`-adjacent ink (slightly blue-black, not pure `#000`).
- **Accent:** single confident blue `#097fe8` / `#0075de` used narrowly for links, primary CTA, and active nav state — the rest of the chrome stays deliberately quiet/neutral so content is the visual focus.
- **Secondary tones:** muted grey-brown `#a39e98` for secondary text/icons, light blue `#62aef0` for hover/lighter accent states.
- **Typography:** system-first sans (`NotionInter`/system UI stack) — optimized for long-form reading density rather than dashboard chrome.
- **Sidebar pattern (observed, widely documented via product familiarity):** persistent left sidebar ~240px, icon+label rows, nested page tree with disclosure triangles, workspace switcher pinned at top, "+" quick-add actions inline on row hover, drag-handle reordering.
- **Empty state pattern:** friendly icon/illustration + short heading + muted body copy + single primary "Add/Create" CTA — minimal, low-pressure tone vs. Stripe/Vercel's more clinical empty states.

---

## 8. Cross-product synthesis table

| Aspect | Common pattern across products |
|---|---|
| Background layering | 2–3 flat neutral layers (canvas → surface → raised), rarely more; semantic names (`bg`, `bg-surface`, `bg-inverse`) preferred over raw hex in every *official* system (Polaris, Vercel, Supabase). |
| Text | 3–4 step ink scale: primary / secondary(muted) / disabled / inverse. |
| Accent | Exactly **one** dominant brand hue per product, used sparingly for primary actions + active nav + links; status/semantic colors (success/warning/danger/info) kept separate from brand accent. |
| Borders | Hairline 1px, low-contrast (`gray-200`-ish on light, near-invisible on dark), used more than shadows to separate cards/table rows. |
| Elevation | "Soft" preferred: small blur radius, low opacity, warm/neutral tint; heavier shadow reserved for floating (menu/modal/tooltip) surfaces (Vercel's Materials taxonomy is the clearest documented example). |
| Radii | Two clusters: **tight/pro** (6–12px: Vercel, Stripe, Supabase, Linear) vs **friendly/builder** (12–16px: Retool, Notion, Polaris cards). |
| Spacing | 4px base unit almost universally (Polaris explicit: 4/8/12/16/20/24/32...). |
| Typography | Geometric/humanist sans for UI (Inter, Söhne, Geist Sans, system-ui) + a monospace pairing for data/code (Geist Mono, IBM Plex Mono, tabular-nums) is the dominant pro-admin pattern. |
| Tables | Sticky header, hairline row dividers > zebra striping as default, hover-row action reveal, tinted-pill status badges (not colored text), monospace/tabular numerals for numeric columns, dense row height (32–40px). |
| Badges | Pill or small-radius, tinted background + matching text (not white text on solid fill) is the more common "pro" convention (Stripe, Retool); Polaris uses filled pill tones. |
| Empty states | Icon/illustration + heading + 1-line body + single primary CTA — consistent 4-part anatomy across Polaris `EmptyState`, Notion, and dashboards generally. |
| Sidebar | 220–260px width, icon+label rows, section grouping with subtle headers, active state = filled background chip (not just bold text or a bare left border) is increasingly favored (Vercel, Linear, Notion). |

---

## 9. Unified Cloud White + 3D adaptation

Mapping the above research onto **our Cloud White theme** — white canvas, slate ink, electric-blue accent, Space Grotesk (display) + DM Sans (body/UI), soft 3D elevation, **no dark backgrounds**.

### Background/surface scale (light-only, Polaris/Vercel-style semantic layering)
- `surface.canvas` — `#FFFFFF` (page background, pure white — we skip Polaris/Notion's warm-grey canvas to keep the "Cloud White" identity crisp).
- `surface.raised` — `#F8FAFC` (slate-50) — cards/panels resting just above canvas, following the Vercel "Background 2 used sparingly" rule.
- `surface.sunken` — `#F1F5F9` (slate-100) — table zebra / input backgrounds / code blocks.
- `surface.overlay` — `#FFFFFF` at 100% + heavier shadow (modals/drawers), never a dark scrim tint on the panel itself — only the backdrop gets a translucent slate scrim (`rgba(15,23,42,0.4)`), the panel stays white per the "no dark backgrounds" rule.
- `surface.hover` / `surface.active` — `#F1F5F9` / `#E2E8F0` — adopting Vercel's Color-1/2/3 default/hover/active ramp concept but confined to light slate tints.

### Text/ink scale (slate ink, Notion/Linear-style ramp)
- `ink.primary` — `#0F172A` (slate-900) — headings, high-emphasis body.
- `ink.secondary` — `#475569` (slate-600) — body copy, secondary labels.
- `ink.muted` — `#94A3B8` (slate-400) — placeholders, disabled, timestamps.
- `ink.inverse` — `#FFFFFF` — text on filled accent/dark chips only (small surfaces, not full-page dark mode).

### Accent (electric blue, single-accent discipline from Notion/Linear)
- `accent.default` — `#2563EB` (electric blue 600) for primary buttons, active nav, links, focus rings.
- `accent.hover` — `#1D4ED8`, `accent.subtle-bg` — `#EFF6FF` (blue-50) for badge/chip tints and selected-row backgrounds — mirrors Stripe's tinted-pill badge convention and Vercel's tint-ramp roles.
- Status colors kept separate from brand blue: success `#16A34A` / warning `#D97706` / danger `#DC2626` / info reuses accent blue — each with a `-subtle-bg` tint pair for pill badges (Stripe/Retool pattern).

### Borders/dividers
- `border.default` — `#E2E8F0` (slate-200) hairline, used for card outlines and table row dividers instead of zebra as the default (Stripe/Linear/Vercel convention) — we can still offer optional zebra (`surface.sunken`) as a table density preference (Retool-style optional toggle).
- `border.strong` — `#CBD5E1` for input borders/focus-adjacent structure.

### Elevation — "soft 3D" recipes
Because we want **soft, tactile 3D** (not flat Vercel-minimalism, not Linear's borderless dark layering), we combine Polaris/Vercel's low-contrast shadow discipline with a slight dual-shadow "3D" lift:
- `shadow.xs` (chips, inputs): `0 1px 2px rgba(15,23,42,0.06)`
- `shadow.sm` (cards, resting): `0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)`
- `shadow.md` (raised cards/hover/popovers): `0 4px 12px rgba(15,23,42,0.10), 0 2px 4px rgba(15,23,42,0.05)`
- `shadow.lg` (modals/drawers — Vercel "material-menu/modal" tier): `0 12px 32px rgba(15,23,42,0.16), 0 4px 8px rgba(15,23,42,0.06)`
- Optional **soft-3D bevel** accent for primary buttons/key cards: inset top highlight `inset 0 1px 0 rgba(255,255,255,0.6)` layered under `shadow.sm/md` to read as a subtle raised white surface — gives the "3D" tactility Vercel/Stripe deliberately avoid, but keeps it *soft* (low blur spread, no hard drop shadows), so it doesn't compete with the clean white canvas.

### Radii
Adopt the "tight/pro" cluster (Vercel/Stripe/Supabase) rather than Retool's 16px friendliness, since Cloud White targets a precise fintech-adjacent pro feel:
- `radius.sm` 6px (inputs, chips, small buttons)
- `radius.md` 8px (buttons, table cells)
- `radius.lg` 12px (cards, panels)
- `radius.xl` 16px (modals/drawers)
- `radius.full` pill (badges/avatars)

### Spacing
Adopt Polaris's explicit 4px-base scale directly: `0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96px` — gives fine control at the low end (dense tables) and generous jumps at the high end (page sections).

### Typography
- **Display/headings:** Space Grotesk 600/500 — used the way Retool/Vercel reserve a distinct display face for headings, while body stays in a neutral workhorse font.
- **Body/UI:** DM Sans 400/500 — playing the same role Inter plays for Linear/Retool/Notion (a clean humanist grotesque for controls, labels, table cells).
- **Numeric/data:** apply `font-variant-numeric: tabular-nums` on DM Sans for table/financial figures (Stripe/Vercel convention) rather than introducing a third mono face, to keep the stack to two families.
- **Type scale (px / line-height):** 12/16 (caption), 13/18 (table/UI small), 14/20 (body), 16/24 (body-lg), 18/26 (h4), 22/30 (h3), 28/36 (h2), 36/44 (h1) — modeled on Polaris/Vercel's compact-but-legible dashboard scales rather than marketing-site type scales.

### Data-table conventions
- Row height 40px default / 32px "compact" density toggle (Retool-style optional density).
- Sticky header with `border.default` bottom hairline; no default zebra — hairline row dividers (Stripe/Vercel/Linear convention); optional zebra via `surface.sunken` alternating rows as a user preference.
- Numeric columns right-aligned + tabular-nums; type/status columns render as tinted pill badges, never bare colored text.
- Sort indicators as small chevron icon inline in header label (not separate icon column); active filters shown as removable chips in a filter bar above the table (Linear-style).
- Empty state inside table body: centered icon (accent-tinted circle) + heading + one-line body + primary CTA button — 4-part anatomy per Polaris `EmptyState` and Notion patterns.

### Badge/chip conventions
- Size: 20–24px height, `radius.full` (pill), 8–10px horizontal padding, 12px medium-weight label.
- Color: tinted background (`-subtle-bg`) + matching darker text of the same hue (never solid-fill white-on-color for default status badges, reserving solid fill for high-emphasis "New"/count badges) — following Stripe/Retool tinted-pill convention.

### Empty states
Icon (48–64px, accent-tinted circular chip) → heading (Space Grotesk, 16–18px) → body (DM Sans, 14px, `ink.secondary`, 1 sentence) → primary CTA button — directly modeled on Polaris `EmptyState` + Notion's low-pressure tone, applied consistently across tables, dashboards, and search results.

### Sidebar pattern
- Width 240px expanded / 64px icon-only collapsed rail (Notion/Vercel-scale width).
- Icon (20px) + label rows, 36–40px row height, `radius.md` active-state background chip in `accent.subtle-bg` with `accent.default` icon/text (Vercel/Linear "filled chip active state" convention rather than a left border bar).
- Section grouping via small uppercase `ink.muted` caption labels with 16px top spacing before each group (Notion nested-tree style, flattened to one level for admin use).

### Form/input patterns
- Inputs: white/`surface.canvas` fill, `border.default` 1px, `radius.sm`, 36–40px height, focus state = `accent.default` 2px ring + border color shift (no glow/dark-mode-style blue haze) — consistent with Vercel/Stripe/Supabase pro-input conventions.
- Labels above field (DM Sans 13px medium, `ink.secondary`), helper/error text below at 12px.

### Modal/drawer patterns
- Modals: centered, `radius.xl`, `shadow.lg`, white surface, `rgba(15,23,42,0.4)` backdrop scrim (light backdrop tint, not black), max-width 480–640px for forms, header with title + close icon + `border.default` divider before footer actions.
- Drawers: right-anchored, full-height, `shadow.lg`, same white surface + slate-scrim backdrop, used for detail/edit panels to preserve list context (Retool/Supabase Studio side-panel convention) rather than always defaulting to a full-page navigation for record detail.

