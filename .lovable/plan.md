# Fix Plan — 7 Defects from Today's Two Videos

Video frame-by-frame audit + staff subagent gap analysis (Chamet/Bigo pattern → our code) সম্পন্ন। প্রতিটা defect-এর root cause file:line সহ verified। Design untouched, শুধু functionality professionalized।

---

## Honest split: Lovable-এ verify possible vs APK rebuild required

| # | Defect | Where | APK rebuild? | Lovable-এ verify? |
|---|---|---|---|---|
| 1 | Auth toast logo-র উপর overlap | React | ❌ No | ✅ Yes |
| 2 | Login button faded pale-pink when empty | React | ❌ No | ✅ Yes |
| 3 | Go Live preview blurry/distorted | Kotlin | ✅ **Yes** | ❌ No |
| 4 | White flash on navigate away | React | ❌ No | ✅ Yes |
| 5 | Party Room host seat-1 pitch black | Kotlin + React | ✅ **Yes** | ❌ No |
| 6 | Private Call caller dialing-screen black | Kotlin + React | ✅ **Yes** | ❌ No |
| 7 | Home feed live cards static photo (no rotating snapshot) | Edge Fn + React | ❌ No | ✅ Yes (after cron deploy) |

**4টা defect (1, 2, 4, 7) আমি Lovable-এ end-to-end fix + owner account দিয়ে verify করব।**
**3টা defect (3, 5, 6) Kotlin code লিখব, কিন্তু verify-এর জন্য আপনার APK rebuild লাগবে — সেটা আমি honestly বলে দেব, ভুয়া "verified" claim করব না।**

---

## Defect 1 — Auth toast overlaps logo

**Root:** `src/components/ui/sonner.tsx:14` — `position="top-center"` কোনো safe-area inset offset নাই, status-bar (~28dp)-এর পেছনে চলে যাচ্ছে।

**Fix:** Sonner-এ `offset={{ top: "max(env(safe-area-inset-top) + 8px, 56px)" }}` যোগ + `--sonner-offset` CSS var। Chamet/Bigo এই pattern-ই use করে।

## Defect 2 — Login button pale pink

**Root:** `src/pages/Auth.tsx:2843` — `disabled:opacity-40` + gradient WebView compositor-এ desaturate হয়ে পুরো button পাল্টে যাওয়ার মতো দেখায়।

**Fix:** `disabled:opacity-60 disabled:saturate-100` — brand color অপরিবর্তিত, শুধু opacity দিয়ে disabled communicate। Bigo এই rule follow করে।

## Defect 3 — Go Live preview blurry [APK rebuild]

**Root:** `LiveKitPlugin.kt:909` — `room.initVideoRenderer(renderer)` `parent.addView()`-এর **আগে** call হচ্ছে। EglBase context valid হওয়ার আগে capture start → scrambled frames।  
Plus `startLocalPreview` (line ~219)-এ explicit `VideoCaptureParameter(720,1280,30fps)` নাই; `livekitCameraTuning.ts` শুধু web path-এ effective।

**Fix:** (a) `initVideoRenderer` কে `addView`-এর পরে move। (b) `LocalVideoTrackOptions(captureParams = VideoCaptureParameter(720,1280,30))` যোগ।

## Defect 4 — White flash on navigate

**Root:** GoLive + PartyRoom-এর 8টা `navigate()` call `clearNativeMediaSurface()` synchronously call না করেই fire হয়। তালিকা:
- `GoLive.tsx:473, 845, 976`
- `PartyRoom.tsx:900, 908, 941, 1079, 1324, 1367`

**Fix:** প্রতিটার আগে synchronous `clearNativeMediaSurface()` insert।

## Defect 5 — Party Room host seat black [APK rebuild]

**Root:** `PartyRoom.tsx:2604` host seat-এ local MediaStream pass করে; কিন্তু native `seatRenderer.bindSeatRenderer({identity})` শুধু **remote** participant identity expect করে। Local participant-এর identity কখনো bind হয় না → seat-1 pitch black। Chamet local CameraTrack-কে instantly host seat-এ attach করে, SFU echo-র অপেক্ষা না করে।

**Fix:** (a) React-এ host seat mount-এ `bindSeatRenderer({seatIndex:0, identity: room.localParticipant.identity, mirror:true})` call। (b) Kotlin `bindSeatRenderer`-এ identity match হলে `previewTrack.addRenderer(slot.renderer)` short-circuit।

## Defect 6 — Private Call caller black [APK rebuild]

**Root:** Previous fix (`mem://features/private-call-white-screen-fix-2026-06-17.md`) শুধু callee-side handle করেছিল। Caller-side-এ `PrivateCallActivity.kt` `attachLocal` শুধু room connect-এর পরে call হয় — DIALING/RINGING phase-এ `vm.localVideo` null, তাই no-op → pure black। `CallProvider.tsx`-এ caller path-এ `setNativeMediaSurface(true)` কোথাও call হয় না।

**Fix:** (a) `PrivateCallActivity.kt`-এ DIALING/RINGING state entry-তে `attachLocal(vm.localVideo.value)` immediately। (b) `CallProvider.tsx`-এ outgoing call init-এ `setNativeMediaSurface(true)` synchronously। WhatsApp/Bigo এটাই করে।

## Defect 7 — Home feed: static photo, no live snapshot rotation

**Root:** `src/pages/Index.tsx:252,517` — `live_thumbnail_url` field exist করে, render condition correct, কিন্তু **field কখনো কেউ write করে না** → always avatar। Chamet/Bigo server-side cron snapshot job চালায়।

**Fix:**
1. New Supabase Edge Function `live-snapshot-cron` — every 15s, active `live_sessions` query, LiveKit egress JPEG snapshot, Storage-এ upload, `profiles.live_thumbnail_url` update। শুধু opt-in host-দের জন্য।
2. `Index.tsx`-এ Ken-Burns CSS animation (subtle zoom) — Chamet feel।
3. Realtime subscription `profiles_public.live_thumbnail_url` column change-এ।

---

## Execution order (after approval)

**Phase A — Pure React (Lovable verify possible):** Defect 1, 2, 4 → owner account দিয়ে preview-এ test।
**Phase B — Edge function:** Defect 7 cron + React Ken-Burns → preview verify।
**Phase C — Kotlin (APK rebuild required):** Defect 3, 5, 6 → code ঠিক করে দেব, আপনি rebuild করে test করবেন। আমি ভুয়া "verified" বলব না।

কোনো design touch হবে না (memory rule), শুধু English UI strings (memory rule)।

**Approve করলে Phase A থেকে শুরু করব।**
