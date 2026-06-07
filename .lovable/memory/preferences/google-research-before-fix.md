---
name: Google-research-before-fix
description: For any non-trivial live/call/party/RTC/animation/billing bug or feature, run web research (subagent or websearch) to compare professional apps BEFORE writing code
type: preference
---
**Rule:** Live streaming, private call, party room, RTC, camera, billing (diamond/beans), hourly bonus, gift, animation — এই category-এর যেকোনো non-trivial fix/feature-এর জন্য **code লেখার আগে Google research বাধ্যতামূলক**।

**How to apply:**
1. Task scope check: trivial cosmetic (color, padding, label text) হলে skip OK
2. Otherwise: spawn research subagent OR use `websearch--web_search` / `firecrawl` for Bigo/Chamet/StreamKar/PoPo/CrushLive/HiClub/Wejoy industry standard
3. Research result সংক্ষেপে chat-এ summarize (1-3 line) — "Bigo এভাবে করে, Chamet ওভাবে, আমরা X approach নিচ্ছি কারণ Y"
4. তারপর code edit
5. Research findings significant হলে `mem://features/<topic>` file-এ save

**Why:** User explicit 2026-06-07: "কাজ শুরু করার আগে তুই অবশ্যই অবশ্যই আগে Google-এ research করে দেখবি যে professional apps কীভাবে কাজ করে এবং তোরটা তুই কী ভুলগুলো করছিস।" আগের ভুলগুলো এসেছে assumption থেকে — industry pattern verify না করে patch দেওয়া থেকে।

**Exempt (no research needed):**
- Pure UI text/color/spacing changes
- Bug already root-cause identified with stack trace
- User explicitly says "just do X, no research"
