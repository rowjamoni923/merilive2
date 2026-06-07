---
name: Follow MeriLive migration plan
description: Read .lovable/plan.md before any live/call/party/RTC/camera/animation task and tick completed checkboxes
type: preference
---
**Rule:** যেকোনো live streaming, private call, party room (audio/video/game), camera, mic, RTC, LiveKit, gift/entry animation, native plugin সংক্রান্ত কাজ শুরু করার আগে **MUST** `.lovable/plan.md` পড়তে হবে।

**How to apply:**
1. Task শুরুর আগে `.lovable/plan.md` view করব
2. Relevant phase + task locate করব
3. Files-to-modify list strictly follow করব — extra file edit না
4. Success criteria verify করব (preview test using mem://preferences/test-account.md যদি applicable)
5. Complete হলে `[ ]` → `[x]` mark করব plan file-এ
6. Architecture rule change হলে `mem://index.md` update করব

**Why:** User 11 মাস waste হয়েছে patch-upon-patch করে। এখন phased, plan-driven, checkbox-tracked approach ছাড়া কোনো RTC কাজ allowed না। কখনো plan skip করে directly code লেখা যাবে না — even small fix-এর জন্যও plan-এ note থাকতে হবে।
