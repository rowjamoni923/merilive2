# Premium / Luxurious App-Wide Polish Plan

Goal: Make every button feel premium, fix every unreadable text (white-on-white, dark-on-dark), zero "broken" looking pages. No regressions.

The earlier blind codemod replaced `text-white` → `text-slate-900` everywhere, which broke buttons that sit on dark gradients (we already had to repair Auth + 16 header pages by hand). So this round must be **systematic, not blind**.

---

## Phase 1 — Root-of-tree fixes (one place, every Button benefits)

Touch `src/components/ui/button.tsx` only:

1. Add 4 premium variants used everywhere going forward:
   - `luxury` — gold/amber gradient, soft inner highlight, deep shadow (for primary CTAs like "Start", "Recharge", "Buy")
   - `premium` — brand→info gradient, glass border, subtle gold ring on hover (for secondary primaries like "Continue", "Save")
   - `glass` — frosted white/10 with white border + white text (for buttons sitting on dark images: Auth, Live, Party)
   - `outline-premium` — transparent + gold border + dark-foreground text on light, white text on dark (auto via CSS var)
2. Upgrade the existing `default`, `destructive`, `secondary` so they have:
   - subtle gradient background
   - 1px translucent inner border (`shadow-[inset_0_1px_0_rgba(255,255,255,.15)]`)
   - elevated drop-shadow on hover
   - active:scale-[0.98] press feedback
3. Standard height tokens: `h-9 / h-10 / h-12` mapped to `sm / default / lg`, all with `rounded-xl` for the premium look.

Result: every existing `<Button>` instantly looks more premium without touching call sites. Pages that need the explicit luxury look just switch `variant="luxury"`.

## Phase 2 — Two safe codemods

Run on `src/` excluding `merilive_flutter/`, `android/`, `node_modules`, `dist`:

1. **Readability codemod** — only fixes provably broken pairs:
   - `text-white` on light background card (`bg-white`, `bg-card`, `bg-slate-50/100`) → `text-slate-900`
   - `text-slate-{800,900}` on dark gradient (`bg-gradient-* from-(brand|info|success|warning|destructive|primary|purple|pink|rose|red|emerald|green|blue|indigo)-{500-900}`) → `text-white`
   - `border-white` on light bg → `border-slate-200`
   - `text-white` on `bg-white` button → `text-slate-900`
   Each rewrite verified against surrounding 12 lines (no blind line-by-line replace).
2. **Copy polish codemod** — string-only:
   - Strip emoji from titles (`🎉`, `✅`, `🎁`, `❤️`) in dialog `<DialogTitle>` / toast `title:`
   - Sentence-case button labels ("Phone Number" → "Continue with Phone", "Email" → "Continue with Email", "Start" → "Get Started", "Login" → "Sign In", "Submit" → "Confirm")
   - Strip "..." from button labels, keep only on loading states

## Phase 3 — Manual audit of top user-facing routes

In this exact order (highest visibility first), audit each for: button variant upgrade, header contrast, balance card readability, modal text contrast, copy professionalism:

```text
1. /            (Home / Discover)
2. /profile + /profile/:id
3. /chat + chat list
4. /recharge + /recharge-history
5. /tasks + /vip
6. /agency-dashboard + agency sub-routes
7. /host-dashboard + helper dashboards
8. /live + party room
9. Settings, Notifications, Reports
10. Auth flow (already partially done — finish remaining dialogs)
```

Per-route checklist:
- Primary CTA → `variant="luxury"` or `variant="premium"`
- Header back/icon buttons on dark gradient → `text-white`, subtitle `text-white/80`
- Cards on white surfaces → `text-foreground` / `text-muted-foreground` only
- No raw hex; only design tokens
- Copy polished

## Phase 4 — Verification

- `npm run scan:dark` must stay clean against fresh baseline
- `lovable-exec test` if any tests exist for those routes
- Open Auth, Home, Profile, Recharge, Agency Dashboard, Host Dashboard, Live in preview — visual smoke check via screenshots
- Re-baseline scanner once

---

## Technical scope (for reference)

- ~177 files in dark-token baseline; expect Phase 1+2 to drop it by ~40% and Phase 3 to clean the visible top routes
- Estimated touch: `button.tsx` (rewrite), 2 codemod scripts, ~25–35 page/component files in Phase 3
- No backend / DB / RLS / financial code touched
- No removal of `dark-ok` markers added in earlier rounds (Auth gradient hero, history headers)

## What I will NOT do

- Blind text-color regex across all files (caused the Auth break)
- Touch admin panel `.admin-content` — already polished in Pkg3
- Touch any flutter/android folders
- Change feature behaviour, copy semantics, financial labels ("Beans", "Diamonds", "Host Earning" stay verbatim)
- Modify gradient brand colors in `index.css` (those are admin-tunable tokens)

## Confirm before I start

Big questions:

1. **Scope** — OK to ship in 4 sequential reply turns (Phase 1 → 2 → 3 → 4), or do you want it ALL in one giant turn? One-turn = high credit cost + harder to review.
2. **Variant default** — should `<Button>` with no `variant` prop become the new "premium" look automatically, or keep `default` flat and require explicit `variant="luxury"` on CTAs? (Auto = lazier upgrade everywhere; explicit = safer for Admin panel.)
3. **Copy polish** — OK to rephrase button labels project-wide (e.g. "Phone Number" → "Continue with Phone", "Login" → "Sign In") or keep the exact strings the user wrote?
