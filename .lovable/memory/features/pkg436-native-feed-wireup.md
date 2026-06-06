---
name: Pkg436 NativeFeed wire-up (Phase 2)
description: Wire NativeFeed plugin into Index.tsx home host grid (additive overlay, default OFF).
type: feature
---

DONE 2026-06-06. Phase 2 of "complete all incomplete plugins" roadmap (Pkg435-440).

Index.tsx now mirrors `displayHosts` to the native RecyclerView grid via `useNativeFeed` hook (Pkg433 infra). When the `feed:native` flag (or DevOptions `nativeFeed`/`feedNative`) is ON and platform is Android-native, the overlay opens with `title="Home"` and renders 2-col grid with Glide cached thumbnails. Tap → `handleUserClick(id, isLive, liveStreamId)` via `hostIndexRef` lookup (live → `/live/:id`, else → `/profile-detail/:id`).

Card shape: `{ id, title=display_name||username, subtitle=country_flag||country_code, thumbUrl=live thumbnail when isLive else avatar (both normalized via `normalizeProfileMediaUrl`), liveBadge=isLive, country=country_code }`.

Additive — React grid stays rendered underneath; native overlay sits on top when active. No-op on web / iOS / older APKs / flag-off cohort. Zero regression risk. Tap, loadMore listeners auto-removed on unmount via hook.

NOT wired (intentional):
- Discover.tsx (renders party rooms, different card shape — needs a second variant or future PartyFeed plugin).
- Country tabs / category chips overlay (plugin doesn't expose header chips yet).
- Pull-to-refresh inside native overlay (React PTR still works through overlay).
- `appendItems` pagination — Index.tsx currently fetches full list; loadMore listener wired but unused.

Files:
- `src/pages/Index.tsx` (import + memoized cards + useNativeFeed + setItems effect)

Roll forward: enable for a small Android cohort by toggling DevOptions → "Native Feed Grid", verify scroll fps and tap routing, then default ON in `feedNativeFlag.ts`.
