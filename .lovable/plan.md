
## লক্ষ্য

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
