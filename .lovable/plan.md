
## লক্ষ্য

## Support live chat hotfix — 100% two-way delivery

- Root cause: `support_messages` insert succeeds path was blocked after insert because `tg_touch_support_ticket_on_user_message()` updates `support_tickets.status = 'open'`, then `tg_guard_support_tickets_update()` rejects ordinary-user status changes with `Only subject and category can be changed on your own ticket`.
- Fix: keep direct user ticket-status edits forbidden, but allow the trusted nested server trigger to reopen/touch the ticket after a valid user message insert. This preserves security and allows unlimited user→admin messages.
- Realtime: user messages still fan out to admin through `support_messages` / `admin_broadcast`; admin messages still fan out to the ticket owner through `app_sync` + `support_reply` notification. No polling substitute should be required for delivery.
- Expected production behavior: admin and user can send unlimited messages on open/pending live-chat tickets; both sides reload/receive the same message history instantly; closed/resolved tickets still block new user messages.

### Industry notes
- Chamet/Bigo-style live support behaves like a normal role-scoped chat thread: participants can keep replying until support closes the ticket, and status changes must be server-authoritative.
- Agora-style apps usually use a realtime signaling/data channel for chat fanout; in this app the equivalent is Supabase Realtime/app-sync for support chat while LiveKit remains for in-room media.

Admin panel মোবাইল থেকে চালানোর সময়ও যাতে professional ভাবে কাজ করে — সব tab/table/dialog/form ৩৬০px width-এ ঠিকঠাক ফিট করে, কোনো horizontal scroll বা কাটা UI না থাকে।

Sidebar শেল আগেই mobile-ready (hamburger + drawer). কাজ বাকি = ভিতরের প্রতিটা page-এর content layer।

## Wave 1 — সবচেয়ে urgent (এই turn-এ ship)

আপনি যেগুলো নাম ধরে বলেছেন:

1. **AdminSupportTickets.tsx**
   - 5-column tab strip ৩৬০px-এ ভেঙে যায় → horizontal scrollable tab strip + shorter labels
   - Stat cards: `grid-cols-2 md:grid-cols-4` → ঠিক আছে, padding/typography মোবাইলে কমানো
   - Ticket dialog: full-screen sheet on mobile (`w-screen h-[100dvh]`), header/footer sticky, message body flex-1 scroll, reply textarea + send button bottom-anchored
   - Inner `grid-cols-3` user-info grid → `grid-cols-1 sm:grid-cols-3`
   - Action buttons row → wrap + icon-only on <sm

2. **AdminEmailBroadcast.tsx**
   - Form fields full-width, send button full-width on mobile
   - Recipient preview table → card list on <md

3. **AdminGmailSupport.tsx**
   - Inbox/list/detail split → stacked on mobile (master-detail toggle)
   - Reply composer = bottom sheet on mobile

## Wave 2 — প্রতিদিনের admin workload (পরের turn)

- AdminUserManagement, AdminAgencies, AdminAgencyDetail
- AdminUnifiedApprovals, AdminFinance, AdminEpayWithdrawals
- AdminPushNotificationBroadcast, AdminBanners, AdminPopupBanners
- AdminFaceVerification, AdminDeviceApprovals

Pattern: wide tables → card list <md; dialogs → full-screen sheet <md; toolbars → wrap + collapse to icons।

## Wave 3 — কম-ব্যবহৃত config screens

বাকি ~60+ admin config pages একটা shared helper দিয়ে batch-pass:
- একটা ছোট utility class set (`admin-table-wrap`, `admin-dialog-mobile`) `index.css`-এ
- প্রতিটা page-এ ৫-১০ মিনিটের audit pass

## কারিগরি details

- নতুন কোনো dependency নয় — পুরো কাজ Tailwind responsive utilities + existing shadcn `Sheet`/`Drawer` দিয়ে
- Breakpoint: `<sm` (≤640px) = phone target, `md` = tablet+, `lg` = desktop sidebar always visible
- Pattern reusable:
  ```text
  Table  → hidden md:table  +  md:hidden card list
  Dialog → DialogContent: w-screen sm:w-auto, h-[100dvh] sm:h-auto, rounded-none sm:rounded-lg
  Tabs   → overflow-x-auto scrollbar-hide, whitespace-nowrap triggers
  Forms  → grid-cols-1 sm:grid-cols-2, buttons w-full sm:w-auto
  ```
- কোনো business logic / DB / realtime / auth change নেই — শুধু presentation layer
- English-only UI strings rule maintained
- Design tokens (semantic colors) ব্যবহার, hardcoded color নেই

## এই plan approve করলে এখনই শুরু করবো Wave 1 দিয়ে — Support Tickets, Email Broadcast, Gmail Support এই তিনটা screen এই turn-এ mobile-perfect করে দেবো। Wave 2 & 3 পরের turn-এ ধাপে ধাপে।
