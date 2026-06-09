---
name: Home banner industry numbers
description: Industry-locked specs for home-page promotional banner carousels (Chamet/Bigo/Poppo/M3/W3C/web.dev). Reference before any banner code/design change.
type: feature
---

# Home Banner Carousel — Industry-Locked Numbers

Sourced 2026-06-09 from M3, W3C APG, WCAG 2.2, web.dev, Cloudflare, Sainsbury's DS, Poppo/Bigo event docs.

## Quick reference
```
Aspect ratio:    2:1 (e.g., 750×375 CDN)
Height:          160–200 dp on 360 dp viewport
Corner radius:   12 dp (M3 CornerMedium)  — we use rounded-2xl (16px) OK
Auto-scroll:     5000 ms default; pause on touch/focus, NO auto-resume (WCAG 2.2.2 Level A)
Dots:            Max 5 visible, bottom-center, active = elongated pill
Image format:    WebP q=75–85 (80 baseline); AVIF q=60–70
CDN widths:      750 / 1080 / 1440 px  — we use 900 q=72, acceptable
1st banner:      loading="eager" + decoding="sync" + fetchpriority="high"  ✅ DONE 2026-06-09
Slot 2+:         loading="lazy" + fetchpriority="low"  ✅ DONE 2026-06-09
Shimmer:         1200–1500 ms cycle until onload
Fade-in:         200–300 ms ease-out opacity
Banner count:    5–8 typical, hard max 10
Tap target:      Full banner tappable + 48 dp min, ripple feedback
A11y:            role="region", aria-roledescription="carousel", per-slide aria-label  ✅ partial DONE
Reduced motion:  Respect prefers-reduced-motion (kill parallax/expand)
```

## Banner type taxonomy (Poppo/Bigo observed)
- **Home Promo** — gradient, no countdown
- **Event/Campaign** — countdown timer overlay, has start/end datetime
- **Tournament/PK** — leaderboard, trophy iconography
- **Rating/Star** — star/diamond overlay
- **Onboarding** — "New" badge
- **Agency/Room** — agency logo watermark

## Proof-upload standard flow (event banners)
1. Tap banner → in-app WebView event detail
2. "Submit Proof" enabled only after server-side threshold met
3. Screenshot upload JPG/PNG <5MB + optional 140-char description
4. "Under Review" pending badge → 24–72h human review SLA
5. Push notif on approve/reject; reward auto-credited
**Anti-pattern:** never ask for screenshot proof for things server already knows (gift count, stream duration) — auto-validate.

## Critical pitfall (LCP)
Mixing `loading="lazy"` + `fetchpriority="high"` → browser **ignores** the priority hint per Chrome/WebKit spec. Always pair eager+high or lazy+low.

## Sources
- web.dev carousel best practices
- M3 Carousel guidelines + accessibility
- W3C WAI-ARIA APG carousel pattern
- WCAG 2.2 SC 2.2.2 (Level A)
- Sainsbury's DS Banner Carousel
- Cloudflare/BlazingCDN WebP playbook 2026
- Poppo Live / Bigo event docs (enjoygm.com, BitTopup)

## Phase 4 status (2026-06-09)
- ✅ Top banner eager+high+sync, middle lazy+low+async
- ✅ role="button" + aria-label on clickable banners
- ⚠️ Deferred (need bigger work, not 1% gaps):
  - Skeleton/shimmer placeholder (currently null while loading)
  - Per-slide carousel (currently stacked single-banner, not a swipe carousel — design decision, ask before changing)
  - Auto-scroll + pagination dots (only if user wants true carousel UX)
  - AVIF support (depends on CDN config)
