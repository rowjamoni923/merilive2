
# Professional Group System — WhatsApp/Telegram/Messenger-class

Goal: rebuild our Family + Basic group experience to match how WhatsApp, Messenger, Imo, Telegram, Chamet, Bigo handle groups. Zero compromise — 100% functional, professional UI, scalable to 5,000 members.

Research-first (mandatory per memory): before each phase I will pull the current behavior of WhatsApp/Telegram/Messenger/Chamet/Bigo for that specific surface (group info, member sheet, invite link, mentions, pinned, etc.) and translate to our LiveKit/Supabase stack. Citations go to plan.md.

---

## Group types (locked with user)

| Type | Who can create | Limit per user | Discoverable | Joining |
|---|---|---|---|---|
| **Family** | Any user, **only if not already in a Family group** | 1 (create OR join — exclusive) | No, invite/link only | Owner approves or invite link |
| **Basic** | Any user, unlimited | Unlimited | No, invite/link only | Owner approves or invite link |
| **Public / Community** | Any user (after L?? — admin-config) | Unlimited | Yes, searchable in "Explore Groups" | One-tap join, no approval |

All three share the same chat engine, member roles, settings, media tabs. Differences are only the rules above + a badge.

Family exclusivity is enforced server-side: a DB trigger blocks `create_chat_group` and `add_group_member` if the user already has any `group_members` row where `groups.group_type = 'family'`. Leave/remove instantly frees them.

---

## Surfaces to build

### 1. Group Info screen (`GroupInfoPanel`)
Opened by tapping avatar / name / header anywhere.
- Large avatar (tap → view / owner tap → change), group name, group type badge (Family / Basic / Public), member count, "created by X on date", description (multiline, admin-edit).
- Action row: Mute, Search, Add member (admin), Share invite link.
- **Media / Links / Docs tabs** (WhatsApp-style) — paginated query on `messages` filtered by attachment kind.
- **Members list** — search bar, role badges (Owner 👑, Admin ⭐, Member), online dot, long-press → action sheet.
- **Pinned messages** section (max 3, WhatsApp parity).
- **Group settings** (admin-only block): Who can send messages (All / Admins only), Who can edit info, Who can add members, Approve new members toggle, Disappearing messages (off / 24h / 7d / 90d), Slow mode (off / 10s / 30s / 1m).
- **Danger zone**: Mute notifications, Clear chat, Exit group, Report group, Delete group (owner only).

### 2. Roles & permissions
- `group_members.role`: `owner` | `admin` | `member`.
- Owner: everything + transfer ownership + delete group.
- Admin: edit info, add/remove members, pin, mute member, change settings (except delete/transfer).
- Member: per group_settings.
- Member action sheet (long-press): Send message, View profile, Make admin / Dismiss admin, Mute in group, Remove from group, Ban (blocks rejoin), Report.

### 3. Invite system
- **Invite link**: `merilive.com/g/<token>` — 16-char unguessable token on `groups.invite_token`. Owner/admin can: copy, share, QR code, reset link, set expiry (1h / 1d / 7d / never), set max uses. `merilive.top` remains landing-only.
- **QR code**: rendered client-side with `qrcode` lib.
- **Pending approval queue** (when "Approve new members" is ON): admin sees requests in Group Info → "Member Requests (3)" with Approve / Reject.
- **Deep link handler** (`/g/<token>`): if logged in → preview card (group avatar, name, member count, "Join") → on tap calls `join_via_invite` RPC.

### 4. Public / Community group discovery
- New "Explore" tab inside Chat page: search bar + category chips + trending grid (sorted by member count + 7-day growth).
- Public group card: avatar, name, member count, short description, Join button.
- One-tap join (no approval) unless owner enables approval.

### 5. Pro messaging inside groups (parity with 1:1)
- Reply, forward (multi-select), react (emoji), pin (admin), edit (15-min window), delete (for me / for everyone within 1h, owner = anytime), copy, star.
- **@mentions**: typing `@` opens member picker; mentioned users get push + highlighted bubble + "You were mentioned" filter in their chat list.
- **Read receipts**: per-message; long-press → "Read by (12)" sheet with timestamps (WhatsApp parity). Settings toggle to disable globally.
- **Typing indicator**: "Alice, Bob typing…" via Supabase Realtime broadcast (already used elsewhere — reuse channel, no polling).
- **Reply preview** in composer, attachment sheet (image / video / camera / doc / contact / location / gift), voice note (long-press mic).
- **System messages**: "Alice joined", "Bob was promoted to admin", "Carol changed group name to …", "Group settings updated".

### 6. Scale to 5,000 members
- Member list virtualized (`react-window`) with server-side search RPC (`search_group_members`).
- Read receipts: aggregate counts only, list paginated.
- Mentions: full-text search on `profiles` scoped to `group_members` (index on `(group_id, user_id)` already present).
- Message fan-out unchanged (single insert + Realtime), but push fan-out moved to edge function batching (chunks of 500).

---

## Database changes

```sql
-- groups
ALTER TABLE groups
  ADD COLUMN description text,
  ADD COLUMN invite_token text UNIQUE,
  ADD COLUMN invite_expires_at timestamptz,
  ADD COLUMN invite_max_uses int,
  ADD COLUMN invite_used_count int DEFAULT 0,
  ADD COLUMN settings jsonb DEFAULT '{"who_can_send":"all","who_can_edit_info":"admins","who_can_add_members":"admins","approve_new_members":false,"disappearing_seconds":0,"slow_mode_seconds":0}'::jsonb,
  ADD COLUMN is_public boolean DEFAULT false,
  ADD COLUMN search_vector tsvector,
  ADD COLUMN max_members int DEFAULT 5000;

-- group_members
ALTER TABLE group_members
  ADD COLUMN muted_until timestamptz,
  ADD COLUMN banned_at timestamptz,
  ADD COLUMN last_read_message_id uuid;
-- role already exists; ensure enum: owner|admin|member

-- new tables
CREATE TABLE group_join_requests (...);   -- pending approvals
CREATE TABLE group_pinned_messages (...); -- max 3 per group
CREATE TABLE group_message_reads (...);   -- per-user read receipts
CREATE TABLE group_message_reactions (...);
CREATE TABLE group_mentions (...);        -- for "mentions" filter + push

-- triggers
- tg_enforce_family_exclusivity (BEFORE INSERT on group_members + groups)
- tg_emit_system_message (on role change, settings change, member add/remove)
- tg_increment_invite_used_count
```
All with proper GRANTs + RLS (member-only read, admin-only write where relevant).

## RPCs (server-authoritative)
`create_chat_group`, `update_group_info`, `update_group_settings`, `add_group_member`, `remove_group_member`, `promote_to_admin`, `demote_admin`, `transfer_ownership`, `leave_group`, `delete_group`, `mute_group_member`, `pin_message`, `unpin_message`, `react_to_message`, `mark_messages_read`, `reset_invite_link`, `join_via_invite`, `approve_join_request`, `reject_join_request`, `search_public_groups`, `search_group_members`.

---

## Frontend file plan

New:
- `src/features/groups/GroupInfoPanel.tsx` (replaces current `GroupSettingsPanel` — full WhatsApp-style screen)
- `src/features/groups/GroupMemberSheet.tsx` (long-press action sheet)
- `src/features/groups/GroupInviteSheet.tsx` (link + QR + reset + expiry)
- `src/features/groups/GroupJoinRequests.tsx`
- `src/features/groups/GroupMediaTabs.tsx` (Media / Links / Docs)
- `src/features/groups/PinnedMessagesBar.tsx`
- `src/features/groups/MentionPicker.tsx`
- `src/features/groups/ReadByList.tsx`
- `src/features/groups/ExploreGroups.tsx` (public discovery)
- `src/pages/GroupInvite.tsx` (`/g/:token` deep-link landing)

Edits:
- `src/pages/Chat.tsx` — wire new panels, add Explore tab, mentions, reactions, pin bar, system messages.
- `src/components/chat/ChatActiveHeader.tsx` — tap → GroupInfoPanel, show typing/online.
- `src/pages/ProfileDetail.tsx` — already shows Family/Basic badge; add "Open in Group" for shared groups.
- `src/App.tsx` — add `/g/:token` route.

All English UI strings (per memory). Design stays mobile-first luxurious; no Sparkles, custom gradient banners on Group Info header.

---

## Build phases (each phase verified in owner test account before next)

1. **DB foundation** — schema, triggers, RPCs, family-exclusivity enforcement, system messages.
2. **Group Info screen** — full new panel + media tabs + pinned bar + settings.
3. **Roles & member sheet** — promote/demote/remove/mute/ban + transfer ownership.
4. **Invite system** — link + QR + expiry + approval queue + `/g/:token` page.
5. **Pro messaging** — mentions, reactions, pin, edit/delete, read receipts, typing, forward, reply.
6. **Public/Community + Explore** — discovery tab, search, one-tap join.
7. **Scale** — virtualized member list, edge-function push batching, indexes.
8. **QA** — owner-account end-to-end on preview; performance check at 1k+ members seeded.

No APK rebuild required for any phase (pure Lovable + Supabase + Realtime). Native gift/entry/camera systems untouched.

---

## Policy / deep-link routing standard (locked)

- Professional chat apps use a canonical app domain for public joins and policy/deep links: WhatsApp documents web-accessible group invite joining (`faq.whatsapp.com/1139252413769848`) and Telegram documents canonical `t.me` HTTPS deep links plus private/public invite links (`core.telegram.org/api/links`, `core.telegram.org/api/invites`).
- MeriLive canonical main-app policy links must use `https://merilive.com`, not the landing-only `merilive.top` and not the preview origin.
- `/policies/levels` and `/policies/levels/:levelCode` must be registered before `/policies/:policyId` on every router branch, with a defensive redirect if `policyId="levels"` ever reaches the generic policy detail page.

---

## What stays the same (sacred)
- Native LiveKit, Camera2, GPUPixel, VAP/SVGA — not touched.
- Gift / entry / animation components — not touched.
- Admin panel as single source of truth — any new limit (max members, invite expiry options, slow-mode tiers) lives in `app_settings`.
- English-only UI strings.

Approve and I'll start with Phase 1 (DB foundation) — single migration with all schema + triggers + RPCs + GRANTs.
