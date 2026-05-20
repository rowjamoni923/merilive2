# Premium L1–L4 Helper Dashboard (mirror Level 5)

## Goal
Reshape `/helper-dashboard` so it looks and feels identical to `/level5-helper-dashboard` — luxurious gold theme, card-based, tabbed bottom strip. **Zero changes to business logic, RPCs, financial flows, or data sources.** Only the JSX render tree is rewritten.

## What the page will look like

```text
┌──────────────────────────────────────────────┐
│  LUXURIOUS GOLD HEADER                        │
│  ← Diamond Helper           🔔                │
│     Level 1–4 · Trader System                 │
├──────────────────────────────────────────────┤
│  [ Show me on Recharge page          ◯ ]     │   ← HelperListingToggle
├──────────────────────────────────────────────┤
│  ┌────────────────────────────────────────┐  │
│  │ 🪙 Accepted Payment Methods   Manage   │  │   ← HelperPaymentMethodsCard
│  │ [bKash] [Nagad] [Rocket] ...           │  │     (clickable → add dialog)
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌────┬────┬────┬────┐                       │
│  │ 0  │ 0  │ 0  │299M│                       │   ← 4 mini stat cards
│  │Req │Pend│Mthd│💎Wlt│                       │
│  └────┴────┴────┴────┘                       │
│                                              │
│  [💲 Open Manual Top-up]                      │   ← gold CTA button
├──────────────────────────────────────────────┤
│  [Orders][Methods][Top-up][History][Inbox]   │   ← 5-tab strip (same style as L5)
├──────────────────────────────────────────────┤
│  Tab content...                              │
└──────────────────────────────────────────────┘
```

Background, gradients, radii, typography, shadows: copied **verbatim** from `Level5HelperDashboard.tsx` so the two pages feel identical.

## Tab strip mapping

L1–L4 helpers don't do agency-withdrawal claims (that's L5 only), so the leftmost tab swaps:

| Tab | What it shows (existing L1–L4 content, just moved into the tab) |
|-----|---------|
| **Orders** | Pending withdrawal/top-up requests assigned to this helper |
| **Methods** | `HelperAcceptedMethodsCard` (tick-marks) + list of own custom local methods + Add button |
| **Top-up** | The full existing Manual Top-up form (level pricing, payment selection, screenshot upload) |
| **History** | Transfer history (already exists at bottom of page today) |
| **Inbox** | Notifications + admin messages |

Every existing dialog (`SwiftPayDepositModal`, `AddLocalPaymentMethodDialog`, transfer modal, screenshot upload modal, trader-level upgrade modal, etc.) stays mounted exactly as it is today — only the trigger buttons/cards move into the new layout.

## Cards on the header (clickable feature cards)

Each stat card is clickable and jumps to the corresponding tab, matching what the user asked for ("ওই card গুলোর উপরে click করলে যাতে এই function গুলোর ভিতরে চলে যায়"):

- **Orders** card → opens Orders tab
- **Methods** card → opens Methods tab + auto-opens Add dialog
- **Wallet** card → opens existing Trader Wallet transfer modal
- **Open Manual Top-up** button → opens Top-up tab

A second row below the stat cards keeps the **Trader Level** card (current/next level + upgrade CTA) — clickable to open the existing trader-level upgrade dialog.

## What stays exactly the same

- All Supabase queries, RPCs, realtime subscriptions
- All financial logic, tier minimums, wallet aggregation
- All existing dialogs (just re-mounted in the new tree)
- `HelperListingToggle`, `HelperPaymentMethodsCard`, `HelperAcceptedMethodsCard`, `AddLocalPaymentMethodDialog`, `SwiftPayDepositModal`
- Existing routing / URL params
- `is_listed` toggle, level-progress hook, trader-tier wallet floor

## Technical approach

1. Extract current L1–L4 render tree into clearly-named sections (`<OrdersTabContent />`, `<MethodsTabContent />`, `<TopupTabContent />`, `<HistoryTabContent />`, `<InboxTabContent />`) as **inline JSX consts inside the same file** — no logic split, no new files, just regrouping.
2. Replace the outer render with the L5-shaped wrapper (gold gradient background, fixed-inset scroll container, luxurious header, toggle + payment-methods card + stat cards + CTA + `<Tabs>`).
3. Copy the L5 `<Tabs>` / `<TabsList>` / `<TabsTrigger>` styling block verbatim (same gradient active states, same emerald/sky/violet color coding).
4. Read `?tab=…` from URL for deep links (parity with L5).
5. Keep every dialog mounted at the end of the component tree exactly as today.

## Out of scope (will NOT touch)

- Any DB migrations, RPCs, edge functions
- Realtime subscriptions / polling intervals (Pkg53/57/62 cost guards untouched)
- L5 dashboard (already done)
- Recharge page layout
- Chat / moderation / call code
- Any financial percentage / formula

## Risks

- The file is 2,460 lines and uses lots of inline state. The refactor will touch ~1,500 of those lines but only restructure them — no state, hooks, or queries change.
- After the rewrite the user should re-test: toggle on/off, add payment method, open manual top-up, view history, view notifications. I'll verify each tab opens without console errors in the preview before declaring done.

## Estimated single-pass delivery

One large edit to `src/pages/HelperDashboard.tsx`. No other files change.
