## Goal

Currently each privilege category (Entry Bar, Portrait Frame, Privilege Sticker, Privilege Gift, Entrance Effect, Party Room Background, Customer Service, Medal Display) is **one row with one unlock_level**. You want each category to hold **many items, one per level** (1, 2, 3 … 100), so:

- Admin can upload an Entry Bar for Lv1, a different one for Lv2, Lv3 … and same for every other category.
- On `/level` (My Level), when a user taps a category, they see the whole ladder Lv0 → Lv100 with what unlocks at each step, locked vs unlocked state, and an "Equip" button for items already unlocked.

This matches how Chamet / Bigo / Poppo / Olamet "Noble / VIP Privilege" pages work (verified pattern: category card → tier list → per-tier preview + equip).

## Database

New table `level_privilege_tiers` (one row per uploaded item per level per category):

```
id, privilege_type (entry_bar | portrait_frame | privilege_sticker |
  privilege_gift | entrance_effect | party_background |
  customer_service | medal_display),
unlock_level (1–100),
name, description,
animation_url, animation_format, preview_url, sound_url, duration_ms,
icon_bg_color, icon_color,
is_active, display_order, created_at, updated_at,
UNIQUE(privilege_type, unlock_level)   -- one item per (category, level)
```

RLS: public can `SELECT` active rows; only admins (`has_role admin`) can insert/update/delete. Grants for `anon`, `authenticated`, `service_role`. Indexed on `(privilege_type, unlock_level)`.

The existing `level_privileges` table stays untouched — it keeps powering the category list/metadata. The new table holds the per-level items.

(Optional, later) `user_equipped_privileges (user_id, privilege_type, tier_id)` to remember which tier each user has equipped — only one equipped per category. Auto-unequip if user level drops below the tier's `unlock_level`.

## Admin UI — `AdminLevelPrivileges.tsx`

- The 8 category cards stay as today (category definitions are constant).
- Clicking a category opens a **Tier Manager** drawer instead of the single-row edit dialog:
  - Header: category name + icon.
  - List of existing tiers sorted by `unlock_level`, each row showing: Lv badge, name, preview thumb, active toggle, edit / delete.
  - "Add Tier" button → opens the existing Create dialog (already has Unlock Level, name, description, colors, AnimationUploader, preview).
  - Saving writes to `level_privilege_tiers` with `(privilege_type, unlock_level)` unique.
- Re-use the existing `AnimationUploader` (SVGA / VAP / Lottie / WebP / PNG / GIF / MP4) — no upload UX change.
- Bulk action: "Copy from previous level" to speed up admin work.

## User UI — `Level.tsx` + new `PrivilegeTierSheet.tsx`

- Category list stays the same.
- Tapping a category opens a full-height bottom sheet (matches your second screenshot style):
  - Title = category name.
  - Vertical list of every uploaded tier (Lv1 → Lv100), each card showing:
    - Level badge (e.g. "Lv 7")
    - Preview thumbnail / animation
    - Name + short description
    - State chip: **Unlocked** (green) if `user.level ≥ tier.unlock_level`, else **Lv N to unlock** (gray lock).
    - Equip button when unlocked (calls `equip_privilege_tier(tier_id)`); shows "Equipped" + glow when active.
  - Auto-scroll so the user's current level tier is centered on open.
- The existing `PrivilegePreviewModal` is re-used for the full-screen preview when tapping a tier card.

## Behavior rules

- A tier is visible to everyone Lv0 → Lv100 (so users can see what's coming), but Equip is gated by `user.level ≥ tier.unlock_level`.
- One equipped tier per category. Equipping a new tier replaces the previous.
- When the user's level drops below an equipped tier's `unlock_level`, it is auto-unequipped (DB trigger on user level change, or check at read time — read-time check is cheaper and matches Bigo behavior).
- Hooks `useUserPrivileges` / `useLevelPrivilegeAutoEquip` are updated to read from `level_privilege_tiers` and pick the user's currently equipped tier per category for in-room rendering (Entry Bar, Entrance Effect, Frame, etc.).

## Order of work

1. Migration: `level_privilege_tiers` + grants + RLS + indexes.
2. Admin Tier Manager drawer in `AdminLevelPrivileges.tsx`.
3. New `PrivilegeTierSheet.tsx` + wire it into `Level.tsx` category tap.
4. (Optional follow-up, ask before doing) `user_equipped_privileges` table + equip RPC + update `useUserPrivileges` to read tier-based equipment for in-room rendering.

Step 4 changes how Entry Bar / Entrance Effect / Frame are resolved in live rooms, so it touches gift/entry animation code paths protected by your "never touch gift/entry animations" rule. I'll only do steps 1–3 now (admin upload + per-level showcase on My Level). Confirm if you also want step 4 (in-room rendering switches to the equipped tier) — that needs a separate go-ahead.

## Out of scope

- No design changes to the existing category cards or the My Level page header.
- No change to how `user_level` / `host_level` are computed.
- Existing single-row `level_privileges` rows stay as the category catalog and are not deleted.
