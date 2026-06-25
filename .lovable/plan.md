# Mobile Customization — Full App (Chamet/Bigo style)

## Approach

পুরো design unchanged রেখে শুধু **mobile ergonomics** professional level-এ আনা হবে:
- Min touch target 44×44px (Apple HIG) / 48dp (Material)
- Safe-area insets (notch/home-indicator) সব fullscreen surface-এ
- Responsive typography scale (clamp-based, no overflow)
- Bottom-sheet pattern modals যেখানে desktop-only dialog ছিল
- Sticky/safe CTA bars নিচে — thumb-zone reachable
- Horizontal overflow audit + fix
- Image/avatar sizing standardized

design-sacred rule অনুযায়ী colors/fonts/visual identity, gift-entry animations, native LiveKit path **touch করব না**।

## Phase Plan (একাধিক turn লাগবে — honesty)

### Phase 1 — Foundation (এই turn)
- `src/index.css` এ mobile utility tokens (touch-target, safe-area helpers, mobile type scale)
- Global Button/Input/Dialog/Sheet shadcn variants-এ min-height bump for `sm:` and below
- `tailwind.config.ts`-এ `min-h-touch` (44px) + `safe-*` utilities

### Phase 2 — Face Verification (এই turn-এর পরের turn)
3837 lines — step-by-step mobile audit:
- Camera preview full-bleed with safe-area
- Instruction overlay readable on 360px width
- Bottom action bar sticky, thumb-zone, 56px height CTAs
- Progress indicator মোবাইলে compact
- Error/retry sheet bottom-sheet-এ

### Phase 3 — Top traffic screens (subsequent turns)
Home → Profile → Live → Call → Chat → Recharge → Wallet → Agency → CSA Dashboard → Admin → Policies

### Phase 4 — Owner-account end-to-end test
smdollarex923 দিয়ে preview-এ 360×800 viewport-এ প্রত্যেক screen verify।

## Technical Details

```css
/* index.css additions */
@layer utilities {
  .touch-target { min-height: 44px; min-width: 44px; }
  .safe-top { padding-top: env(safe-area-inset-top); }
  .safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
  .mobile-h1 { font-size: clamp(1.25rem, 5vw, 1.75rem); }
  .mobile-body { font-size: clamp(0.875rem, 3.8vw, 1rem); }
  .sticky-cta { position: sticky; bottom: 0; padding-bottom: env(safe-area-inset-bottom); }
}
```

Button component-এ `default` size mobile-এ `h-12` (48px) করা হবে, desktop-এ unchanged।

## Out of scope
- Color/font/visual redesign (design memory rule)
- Gift/entry animation files (constraint memory)
- Native LiveKit/Camera2 paths
- Business logic changes

## Verification per phase
Playwright with viewport `375×812` (iPhone) + `360×780` (Android) → screenshot every modified screen → confirm no overflow, touch targets ≥44px, CTAs reachable।

---

**Confirm করলে Phase 1 (Foundation tokens + global shadcn variants) এই turn-এ শেষ করি, তারপর Phase 2 Face Verification পরের turn।**
