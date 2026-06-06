---
name: Pkg433 NativeFeed plugin
description: Native Android RecyclerView 2-col grid feed (host cards + Glide thumbnails) for Home/Discover. Additive, default OFF.
type: feature
---

DONE 2026-06-06.

Goal: WebView grid scroll on Home/Discover with 100+ live host cards drops to ~30-45fps under load (image decode + DOM reflow). Native RecyclerView + Glide thumbnail cache → 60-90fps consistent.

Approach (additive, zero regression):
- Native `NativeFeedPlugin.kt`: FrameLayout overlay on decor view, hidden by default. `open(title)`, `close()`, `setItems()`, `appendItems()`, `clear()`. RecyclerView with `GridLayoutManager(2)`, setHasFixedSize(true), FeedAdapter with VH containing rounded FrameLayout card + Glide ImageView (centerCrop, AUTOMATIC disk cache) + bottom gradient overlay + title/subtitle + optional "LIVE" badge. OnScrollListener emits `feed:loadMore` near bottom; tap emits `feed:tap`.
- Glide reused from Pkg428 (`com.github.bumptech.glide:glide:4.16.0`, already in build.gradle). `onViewRecycled` calls `Glide.with().clear()` to free decoded bitmaps.
- JS bridge `src/plugins/NativeFeed.ts`: typed interface + no-op shim on web/iOS. `isNativeFeedAvailable()` helper.
- Hook `src/hooks/useNativeFeed.ts`: declarative `{enabled,title,onTap,onLoadMore}` → opens/closes, ref-stable listeners, returns `{active,setItems,appendItems}`. Caller keeps owning fetching/realtime/filtering.
- Flag `src/utils/feedNativeFlag.ts`: `localStorage.setItem('feed:native','on')` opt-in. Default OFF.
- Registered in `MainActivity.java`.

NOT done (deferred):
- Country tabs / category chips overlay (header is title-only for now).
- Pull-to-refresh (SwipeRefreshLayout integration).
- Avatar overlay on card / verified badge / VIP frame.
- Multiple layout types (1-col big-card, 3-col compact, masonry).
- Search bar / filter chips.
- Index.tsx / Discover.tsx are NOT wired yet. Hook is callable but no caller exists; intentional gradual rollout.

Files:
- `android/app/src/main/java/com/merilive/app/plugin/NativeFeedPlugin.kt`
- `src/plugins/NativeFeed.ts`
- `src/hooks/useNativeFeed.ts`
- `src/utils/feedNativeFlag.ts`
- `android/app/src/main/java/com/merilive/app/MainActivity.java` (register)
