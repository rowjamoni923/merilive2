
# Persistent Session Container — "Shirt পরে বাজারে যাওয়া" Pattern

## মূল সমস্যা

বর্তমানে `/go-live`, `/live/:id`, `/party-rooms`, `/party/:id`, `/call/:id` সব **আলাদা route**। React Router navigate করলে previous page **unmount** হয় → camera release → নতুন page **mount** → camera আবার acquire → flash/reload/black screen।

User's analogy:
- Preview page = shirt পরা অবস্থা (camera/mic/track already on)
- Go Live চাপা = বাজারে যাওয়া (গন্তব্য বদল, পরনের জিনিস same)
- বর্তমান bug = shirt খুলে আবার পরে বাজারে যাওয়া

## Solution: Persistent Session Container

প্রতিটা flow-এর জন্য **একটা parent route**, ভিতরে `phase` state দিয়ে UI swap। Camera/LiveKit room parent-এ একবার acquire, phase জুড়ে untouched।

```text
Route: /live-session  (একবার mount, কখনো unmount না যতক্ষণ user exit না করে)
  └─ <LiveSessionProvider>            ← camera, mic, LiveKit room hold করে
       ├─ phase==='preview'   → <PreviewUI/>     (setup, beautify, title)
       ├─ phase==='broadcast' → <BroadcastUI/>   (chat, gifts, viewers)
       └─ phase==='ended'     → <EndedUI/>       (stats, share)
```

`Go Live` button = `setPhase('broadcast')` — **navigate করে না**। React শুধু UI subtree swap করে, parent state intact।

## Phase 1 — Go Live (এই request-এর scope)

### নতুন file structure

```text
src/features/live-session/
  ├─ LiveSessionProvider.tsx     ← Context: camera, LiveKit, phase state
  ├─ useLiveSession.ts           ← Consumer hook
  ├─ phases/
  │   ├─ PreviewPhase.tsx        ← GoLive.tsx-এর UI (camera preview, settings)
  │   ├─ BroadcastPhase.tsx     ← LiveStream.tsx-এর host-side UI
  │   └─ EndedPhase.tsx          ← Stream end summary
  └─ index.ts

src/pages/
  └─ LiveSessionPage.tsx         ← নতুন: route handler, renders provider + active phase
```

### Route changes (`src/App.tsx`)

- নতুন route: `/live-session` → `<LiveSessionPage/>` (single route, phase-driven)
- পুরোনো `/go-live` → redirect `/live-session?phase=preview` (backward compat)
- পুরোনো `/live/:id` (host view only) → redirect `/live-session?stream=:id&phase=broadcast`
- পুরোনো `/live/:id` (viewer view) → **unchanged** (viewer-side আলাদা flow, এই pattern শুধু host-side)

### Camera/LiveKit handling

- Provider `useEffect` mount-এ: `acquireCamera()` + `connectToLiveKitRoom(previewMode: true)`
- Phase transition (`preview → broadcast`): same room, শুধু `publishTracks()` flip + server-side `streams` row INSERT
- Provider unmount-এ (user বের হলে): `releaseCamera()` + `disconnect()`
- Camera/track reference Provider-এর ref-এ থাকবে → phase swap-এ touch হবে না

### Migration steps (sequential, safe)

1. Provider + phase files scaffold (empty shells with TODO)
2. PreviewPhase = GoLive.tsx থেকে UI কপি, camera logic Provider-এ move
3. BroadcastPhase = LiveStream.tsx-এর host portion কপি, camera/room Provider থেকে consume
4. EndedPhase = stream end UI
5. Route add + old route redirect
6. Verify: preview-এ flash নেই, Go Live চাপলে UI swap (camera continuous)
7. Old GoLive.tsx + LiveStream.tsx host-path মুছে ফেলা (cleanup pass)

## Phase 2 — Create Party (পরে)

একই pattern:
```text
/party-session?room=:id&phase=preview|in-room|ended
  └─ <PartySessionProvider> (camera, mic, party LiveKit room)
       ├─ PreviewPhase   (CreateParty.tsx UI)
       ├─ InRoomPhase    (PartyRoom.tsx UI)
       └─ EndedPhase
```

## Phase 3 — Private Call (পরে)

```text
/call-session?call=:id&phase=ringing|in-call|ended
  └─ <CallSessionProvider> (camera, mic, call LiveKit room)
       ├─ RingingPhase   (IncomingCall UI)
       ├─ InCallPhase    (CallRoom UI)
       └─ EndedPhase
```

## Native code

**Zero changes।** WebView page navigate করছে না, শুধু React subtree swap হচ্ছে। LiveKitPlugin জানতেও পারবে না — track publish/unpublish JS থেকেই control হবে।

## Risk / Trade-off

- LiveStream.tsx 5309 lines — host vs viewer logic separate করতে হবে। প্রথমে শুধু host portion BroadcastPhase-এ যাবে; viewer flow unchanged।
- GoLive.tsx 2076 lines — beautify/filter/settings UI same রাখব, শুধু camera lifecycle Provider-এ shift।
- Existing routes redirect দিয়ে backward compat — কোনো deep link ভাঙবে না।
- APK rebuild **লাগবে না** (pure web change)।

## Verification plan

1. Owner account দিয়ে preview-এ `/live-session` open → camera preview দেখা
2. "Go Live" tap → UI broadcast-এ swap, camera **flash ছাড়া continuous** (এটাই success criteria)
3. End stream → ended UI, তারপর exit → camera release
4. Console: একবারই `acquireCamera`, একবারই `LiveKit connected` log হবে — Go Live চাপলে আর হবে না

## এই plan-এ Phase 1 মাত্র প্রথম step (Provider + phase scaffolds + route)। তোর approval পেলে সেটা apply করব, verify করে দেখাব camera continuous, তারপর Phase 2 + 3।
