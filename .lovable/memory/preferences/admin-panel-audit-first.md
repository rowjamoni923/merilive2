---
name: Admin panel audit-first mandatory
description: Before touching ANY admin page, load this memory + run professional-apps research + our-app screenshot audit, THEN plan, THEN code. No skipping.
type: preference
---

# 🚨 ADMIN PANEL WORK — AUDIT-FIRST HARD RULE (locked 2026-07-18)

Before ANY admin panel change (color, layout, feature, fix, polish — no matter how small):

## Auto-trigger checklist (fires at start of EVERY admin task)
1. **Load this memory file first** — read before writing a single line.
2. **Professional-apps research** (spawn subagent):
   - Stripe Dashboard, Vercel Dashboard, Linear Admin, Supabase Studio, Retool, Chamet/Bigo/Poppo internal admin panels (public case studies/screenshots).
   - Extract: color tokens, typography, spacing, table density, badge shape, sidebar pattern, empty state, loading state, hover/focus, error card.
3. **Our-app screenshot audit** (Playwright, owner account):
   - Login → walk every sidebar section → every child page → screenshot each.
   - Detect: 404, console error, hardcoded white-on-white / black-on-black, missing icon, broken data binding, slow load (>1.5s), realtime leak.
4. **Gap report** — for each of 15 sections list: professional standard vs our current state vs concrete fix.
5. **Master plan** — 3 tasks per pass, sequential, each pass ends with re-screenshot proof.
6. **THEN code.** Never before.

## Locked design system (do NOT redecide each time)
- Theme: **Cloud White + 3D depth** (see mem://design/admin-cloud-white-3d.md).
- Canvas pure white, slate ink, electric blue accent, Space Grotesk + DM Sans.
- Every card = `AdminCard3D` (soft elevation + hover lift).
- NO dark colors anywhere in admin. NO neon gradient borders. NO glass/blur.
- Count chips with inline bg keep white text.
- Perf: virtualize >200 rows, 50/page pagination, 250ms debounce, `instantRestCache`, memoized rows, zero polling.
- Semantic tokens only — no `text-white`, `bg-black`, `bg-[#...]` in components.

## The 15 sections (locked order, from AdminLayout.tsx)
1. Overview  2. 👥 User System  3. 🏢 Agency System  4. 👑 Level & VIP
5. 🎨 Visual Assets  6. 💰 Diamond & Finance  7. 🤝 Helpers  8. 🎮 Game System
9. 📺 Content  10. 🎉 Party  11. 📞 Calling  12. 🎧 Support
13. 📢 Notifications  14. 🐛 Debug & Logs  15. ⚙️ Settings

## Execution rhythm
- 3 tasks per pass, no more.
- Each pass = code + owner-account re-screenshot + gap-closed proof.
- User approves before next pass.

## Override
Only bypassed by explicit user words "skip audit this time". Otherwise this rule survives every session, every marathon, every context window.
