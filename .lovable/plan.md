## Goal

Convert Home, Party (Discover), Reels, Profile — every visible section — to a clean **professional white/light theme** like Bigo, Tango, MICO. Zero invisible text, zero color clashes, zero missing fonts. Live stream / Party Room / Private Call screens remain dark (untouched, as agreed).

## Already shipped this session

- Bottom Navigation: white surface, dark gap above nav permanently removed, pink active accent
- Capacitor StatusBar: white bg + dark icons (professional native look), exits to white after live/call

## Light theme color contract (single source of truth)

Add a reusable `.app-light-shell` CSS layer in `index.css` so every page uses the same tokens:

```text
Background base       #F7F8FA   (page)
Surface card          #FFFFFF
Elevated surface      #FFFFFF + shadow 0 6px 20px -8px rgba(15,23,42,0.10)
Hairline border       rgba(15,23,42,0.06)
Text primary          #0F172A   (slate-900)
Text secondary        #475569   (slate-600)
Text muted            #94A3B8   (slate-400)
Brand primary         #EC4899 → #A855F7 gradient (pink → purple)
Success               #10B981
Warning               #F59E0B
Danger                #EF4444
Diamond accent        #3B82F6 (blue) with cyan glow
Beans accent          #F59E0B (amber)
```

Every text/icon will use one of these — no white-on-white, no dark-on-dark.

## Execution order (one PR-sized batch per page)

### Batch A — Home (`src/pages/Index.tsx` + home sections)
1. Audit every section: header, search, banner carousel, host feed cards, online dots, badges, gift bubbles, level chips, CTAs
2. Replace dark wrappers (`bg-black`, `bg-zinc-900`, `text-white/...`) with the contract above
3. Card recipe: white bg, subtle shadow, slate-900 name, slate-500 meta, gradient pill for status
4. Sticky top bar: white blur + bottom hairline; status icons dark
5. Verify: every label/number readable on white, no transparent text

### Batch B — Party / Discover (`src/pages/Discover.tsx` + party room list cards)
1. Tab pills: white inactive, gradient-pink active, slate-700 labels
2. Party room thumbnail cards: white surface, gradient ring on live indicator, room title slate-900, member count slate-500
3. Filter chips, segmented controls, empty states all converted
4. (Inside an actual live party room → still dark, untouched)

### Batch C — Reels (`src/pages/Reels.tsx`)
1. Reels feed itself remains dark (full-screen video needs dark) — like Instagram Reels
2. BUT the surrounding chrome (top tabs "For You / Following", action sheets, comment sheet, share sheet, profile peek) → switch to light/white sheets with slate text
3. Bottom comment input → white pill on white sheet
4. Like/comment/share icons remain white over video, slate over light sheets

### Batch D — Profile (`src/pages/Profile.tsx` + sub-sections)
1. Header: white bg, gradient pink-purple banner strip behind avatar (no full-dark banner)
2. Stats row (Followers / Following / Visitors): white cards, slate numbers, gradient icons
3. Wallet/Beans/Diamond chips: white card with colored accent (blue diamond, amber beans)
4. Menu list (Settings, Wallet, VIP, Agency, Help): white rows, slate-900 label, slate-400 chevron, hairline divider
5. Logout button: white card with red text (not red bg)

## Per-batch QA checklist (run on every page before moving on)

- [ ] Every text element passes WCAG AA on its background
- [ ] No element uses `text-white` on a now-white surface
- [ ] No `bg-black` / `bg-zinc-900` / `bg-slate-900` left in the page tree
- [ ] All gradients re-tuned for light context (no neon glow on white)
- [ ] Icons have explicit color class (no inherited white)
- [ ] Modals/sheets opened from this page also light
- [ ] Loading skeletons use slate-200, not slate-800

## What stays dark (do NOT touch)

- Live stream room (`/live/:id`)
- Party room interior (`/party/:id`)
- Private call screen
- Reels video player surface
- Daily Reward popup (premium luxury — already polished)
- Helper Dashboard L1-L4 (already polished obsidian-gold)
- VIP / Noble screens (luxury intentional)
- Admin panel

## How we ship

I'll do **one batch per turn**, post-batch I'll send you a screenshot grid so you can spot anything wrong before I move to the next. If you say "next" I continue; if you say "fix X" I patch then continue. This way nothing breaks silently across 4 pages in one shot.

**Starting with Batch A (Home) right after you approve this plan.**
