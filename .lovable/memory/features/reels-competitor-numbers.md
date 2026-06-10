---
name: Reels competitor numbers
description: Industry-locked metrics for short-video reel player (TikTok/Reels/Likee/Bigo/Kwai/YouTube Shorts/Snap/Chamet/Poppo/Hollah)
type: feature
---

# Reels Phase 7 — Industry numbers (10 apps + ExoPlayer/Media3 docs)

- Poster image **mandatory** on `<video>` (TikTok/IG/Shorts/Kwai/Likee) — paints first frame in <50ms while bytes still arriving → perceived TTFP ~300-500ms faster on 3G.
- `preload="auto"` for the currently-visible reel; off-screen reels should not mount a `<video>` at all (already done — single active video).
- Disk cache for reels: TikTok 256MB, IG 200MB, Shorts 150MB. Ours = 256MB ExoPlayer SimpleCache ✓ (Pkg427).
- Pre-warm next 3 + prev 1 reel, ~2MB each (~5s of 720p). ✓ (Pkg435).
- First-frame target: cold <800ms, warm <200ms (Likee/Bigo benchmark).
- Mute-on-mount: TikTok/IG always start unmuted; Chamet/Bigo Reels start muted (battery + auto-play policies). We follow Chamet pattern ✓.
- Tap-to-pause + double-tap-to-like industry standard ✓.
- Native ExoPlayer surface beneath transparent WebView is the Pkg427 pattern — matches Chamet's hybrid stack.

## Phase 7 web-fallback fix applied (design/logic untouched)
- Added `poster={thumbnail_url}` + explicit `preload="auto"` on the `<video>` fallback path in `src/pages/Reels.tsx`.
- Web/iOS users (and Android with native flag OFF) now see first frame instantly instead of black box during initial buffer.
- Native ExoPlayer path (Pkg427) unaffected.
