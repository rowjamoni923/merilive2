## 5 Critical Issues — Deep Audit & Fix Plan

প্রতিটা issue research-first rule অনুযায়ী আগে audit করব (industry standard + আমাদের current code gap), তারপর fix। এক issue এক pass — যাতে কোনোটা half-baked না থাকে।

---

### Issue 1: App overall slowness (internet থাকা সত্ত্বেও)

**Suspected root causes to audit:**
- Cold-start chunk storm (route prefetch firing too early on low-end Android)
- Realtime channel duplication / leaked subscriptions
- Excessive re-renders from CallProvider / AdminRealtime
- Image cache SW missing or thrashing
- LiveKit warmup blocking main thread

**Audit deliverable:** Chrome trace + bundle analysis + realtime channel count report. Then targeted fix (lazy chunks, debounce, memoization).

---

### Issue 2: Inbox photo not showing instantly

**Suspected root causes:**
- Optimistic UI missing — waits for Supabase Storage upload + signed URL before render
- No local blob preview while uploading
- Realtime INSERT event arriving before image URL is ready
- `MediaUploader.tsx` / `UnifiedChatMessage.tsx` not using `URL.createObjectURL` for instant preview

**Fix pattern (industry std — WhatsApp/Telegram):** Show local blob immediately, upload in background, swap URL on success, show retry on fail.

---

### Issue 3: Call screen goes white during ringing (Android APK)

**Suspected root causes:**
- `IncomingCallActivity` / call UI route lazy chunk not preloaded → WebView blanks while fetching
- FLAG_SECURE + WebView transparency conflict
- LiveKit prejoin renderer attached before DOM mounted
- Cold-start capture redirecting before call route hydrates

**Audit:** logcat from APK + React route mount timing. Likely fix: preload `/call` chunk on FCM receive, keep solid background until first frame.

---

### Issue 4: Agency Dashboard error on entry

**Need:** exact error message/stack. Will reproduce with owner test account (smdollarex923@gmail.com) in preview, capture console, then fix.

Common patterns: missing RLS grant, null agency_id, hook order violation, type mismatch in `AgencyDashboard.tsx`.

---

### Issue 5: Agency creation OTP not arriving (in-app notification + Gmail)

**Two channels broken:**
- **In-app OTP notification:** FCM push payload missing or topic not subscribed for agency-otp event
- **Gmail OTP:** Was "default" but Lovable Emails domain status unknown — need to check `email_domain--check_email_domain_status` first

**Fix order:** verify email domain → fix edge function `send-agency-otp` (or equivalent) → fix in-app notification trigger → test end-to-end with owner account.

---

## Execution Order (one focused pass per issue)

1. **Issue 4 first** (agency dashboard error) — fastest, blocks agency testing for issues 5
2. **Issue 5** (OTP) — needed for new agency signups
3. **Issue 3** (call white screen) — APK-critical, needs rebuild anyway
4. **Issue 2** (inbox photo) — UX critical
5. **Issue 1** (overall slowness) — largest scope, needs profiling data, done last

**Each pass = research → audit current code → identify gap → fix → owner-account verify (where possible in Lovable preview) → mark APK-rebuild items honestly.**

**Design SACRED** — only business logic/functionality touched, zero UI changes.

---

### What I need from you to start

1. **Issue 4 exact error text** — open Agency Dashboard, screenshot or paste the red error. (Or I can reproduce with owner account — just confirm I should.)
2. **Issue 3** — call white screen: happens on caller side or callee side? Both?
3. Approve plan → I start with Issue 4 immediately.