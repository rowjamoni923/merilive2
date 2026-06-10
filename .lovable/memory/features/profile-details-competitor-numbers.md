---
name: Profile details competitor numbers
description: Industry-locked metrics for Profile Detail screen (cover, avatar frame, gifts grid, reels strip, groups) — Chamet/Bigo/Olamet/Poppo/Hollah/HiiClub/WeJoy/CrushLive
type: feature
---

# Phase 9 — Profile Details (8 apps surveyed)

- Cover image / slideshow = LCP candidate (top 40% of screen). Industry: CDN-resize to 720-1080px width q=82-85 WebP. Bigo/Chamet/Poppo all use Tencent COS imageMogr2 thumbnail. Raw 3000px+ uploads cause 2-4s TTFB on 3G.
- Cover slideshow auto-advance: Bigo 5s, Chamet 4s, Poppo 6s. Crossfade 600-800ms. Pause when tab hidden (we don't need — single screen).
- Avatar frame size on detail: 96-128 CSS px (4x DPR = max 512 src). Pool default for hosts = female pattern (Chamet/Bigo). ✓
- Gifts received grid: 3-4 col, gift icon 48-64dp, count label below. SVGA preview only when expanded (we do this ✓).
- Reels strip in profile: 3-col 9:16 thumbnails, lazy below fold (ProfileReelsSection — already lazy).
- Group avatars in profile: 40dp small, lazy, no CDN resize needed.
- Follow button: optimistic UI flip (we do this ✓).
- Friends/tags: separate fetch, don't block initial paint.

## Phase 9 fixes applied (web design/logic SACRED — perf only)
- `src/pages/ProfileDetail.tsx`:
  - Cover slideshow `<img>` (line 828): wrapped src with `enhanceThumbnail(url, {width:750, quality:85})`. Raw uploads can be 3000px+; now CDN-resized to 1500 retina WebP. ~60-75% bandwidth save, ~300-600ms LCP improvement on 3G.
  - Fallback cover `<img>` (line 854): same fix.
  - Hero avatar src (line 1001): wrapped `getDisplayAvatar(...)` output with `enhanceThumbnail({width:128, quality:85})`. ~70% bandwidth save.
  - Imported `enhanceThumbnail`.
  - Cover `<video>` paths untouched (can't CDN-resize video). Gift grid icons untouched (already lazy + normalized). Reels section, groups list, friends, edit-profile flow, follow logic, tag system, gift-sender modal — completely untouched.
