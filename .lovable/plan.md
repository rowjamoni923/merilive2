# ৩ টা সমস্যা — ১০০% Fix Plan

ভাই, তোমার ৩ টা সমস্যাই আমি ধরছি। **research-first** rule অনুযায়ী আগে Chamet/Bigo pattern + আমাদের code audit করব, তারপর code। নিচে প্ল্যান — approve করলে কাজ শুরু।

---

## সমস্যা ১ — Camera handoff lag (১০-২০ সেকেন্ড black)

**Root cause (suspected):** Preview camera আর Published/Active camera **দুইটা আলাদা track**। Publish button চাপলে preview track stop → LiveKit Room connect → new camera track create → publish। এই full cycle-এ ১০-২০s লাগে।

**Pro pattern (Chamet/Bigo/Olamet):** একটাই `LocalVideoTrack` preview screen-এ তৈরি হয়, publish button শুধু **UI swap** করে + same track-কে Room-এ attach করে। Camera কখনো stop হয় না।

**Fix scope:**
- `GoLive.tsx` + `ChametStyleGoLive.tsx`: preview-এ তৈরি `LocalVideoTrack` কে handoff করব LiveStream/PartyRoom-এ (in-memory ref, না নতুন `getUserMedia`/`Camera2 open`)।
- Native side: `LiveKitPlugin.kt`-এ `attachLocal` already আছে — preview phase-এ ওই same renderer track-কে keep alive, publish-এ শুধু `room.localParticipant.setCameraEnabled(true)` call। নতুন capturer create না।
- Web preview path: `hostPreviewSession.ts` already আছে — শুধু consume নিশ্চিত করা।

**Files:** `src/pages/GoLive.tsx`, `src/pages/LiveStream.tsx`, `src/pages/PartyRoom.tsx`, `src/components/call/ActiveCallScreen.tsx`, `android/.../LiveKitPlugin.kt`.

---

## সমস্যা ২ — Live stream-এর button + Mood option কাজ করছে না

**Action:** sub-agent দিয়ে full audit করব —
- প্রতিটা button (mic/cam/flip/beauty/gift/PK/stickers/music/co-host/share/end + **Mood**) এর onClick → handler → backend wiring trace।
- Console-এ click event আসছে কিনা verify (Playwright + owner test account দিয়ে preview-এ login করে real click)।
- Mood option যদি missing/disabled থাকে — restore বা professional implementation।

**Files (suspected):** `src/pages/LiveStream.tsx`, `src/components/live/*Panel.tsx`, mood-related component (audit-এ confirm)।

---

## সমস্যা ৩ — Private call: preview camera receive-এর পর face দেখা যাচ্ছে না

**Root cause (suspected):** Caller preview-এ camera চালু → receiver accept করল → কিন্তু caller side-এ `attachLocal` re-mount race বা preview track lost; receiver side-এ peer track subscribe হচ্ছে কিন্তু renderer mount হচ্ছে না।

**Fix:**
- Caller flow: preview track-কে accept-এর পরেও alive রাখা (problem #১ same handoff pattern)।
- Receiver flow: `ActiveCallScreen.tsx`-এ peer `track-subscribed` event-এ immediate renderer attach (web fallback path-এ already করা; native path-এ confirm করব)।
- Owner test account দিয়ে preview-এ self-call করে verify।

**Files:** `src/components/call/ActiveCallScreen.tsx`, `src/components/call/CallProvider.tsx`, `LiveKitPlugin.kt`, `PrivateCallActivity.kt`.

---

## Honest scope

| Layer | Lovable-এ fix হবে? | APK rebuild লাগবে? |
|---|---|---|
| React/JS handoff logic (problem #১ web path) | ✅ Yes | ❌ |
| Live stream button audit (problem #২) | ✅ Yes | ❌ |
| Web preview self-call (problem #৩ Lovable test) | ✅ Yes | ❌ |
| Native camera continuity (Android final) | Kotlin edit হবে Lovable-এ | ✅ Yes — তোমাকে APK rebuild করতে হবে |
| Native private call peer renderer | Kotlin edit | ✅ Yes |

আমি **Kotlin code পুরোটা লিখে দেব**, কিন্তু `.apk` Lovable build করে না — তুমি `npx cap sync && cd android && ./gradlew assembleDebug` দিয়ে rebuild করবে। এটাতে miss নাই, just honesty।

---

## Order of work (approve করলে)

1. **Research** (subagent): Chamet/Bigo camera handoff + LiveKit `LocalVideoTrack` reuse pattern + LiveKit Android `attachLocal` continuity।
2. **Audit** (subagent): live stream buttons + mood — exact broken handlers list।
3. **Code** (parallel): problem #১ handoff + problem #২ button fixes + problem #৩ renderer।
4. **Verify** Lovable preview-এ owner account দিয়ে: GoLive→publish smoothness, button clicks, self-call face visibility।
5. **APK rebuild instructions** তোমাকে দেব native part-এর জন্য।

**Approve করলে শুরু করব।** কোনো step বদলাতে চাইলে বলো।