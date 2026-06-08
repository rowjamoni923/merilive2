# N3i — Owner APK Test Plan (N3a–N3h verification)

> Lovable preview cannot exercise native Capacitor plugins. After rebuilding the APK with the N3a–N3h changes, the owner (smdollarex923@gmail.com) must run the checklist below on a **real Android device**. Every box is a hard pass/fail — log the failing step with logcat tag `LiveKitPlugin` if anything misbehaves.

---

## 0. Prerequisites
- [ ] `git pull` + `npm install` + `npm run build` + `npx cap sync android` + `npx cap run android` (or install rebuilt APK)
- [ ] Logged in as **smdollarex923@gmail.com** on test device
- [ ] Second device (or web preview in another browser) logged in as a viewer/peer
- [ ] `adb logcat -s LiveKitPlugin Capacitor` running in a terminal

---

## 1. Live broadcast — host side (N3a, N3b, N3g)

1. [ ] Tap **Go Live** → camera preview opens within 2 s, no black flash
2. [ ] Logcat shows `notifyListeners("camera-state", started)` and a `connection-state` with `state=reconnecting` is NEVER seen at start
3. [ ] Wait 30 s. Viewer (step 2) joins → host sees viewer count tick up
4. [ ] **Camera flip** (front → back → front) — each flip completes in <1.5 s, no preview freeze, beauty stays on
5. [ ] Background app for 30 s → return → camera resumes within 1 s (no reconnect overlay)
6. [ ] Background app for >60 s → return → host-grace-end fires, session re-binds cleanly
7. [ ] **End Live** → camera LED clears within **2 s** (N3g invariant)
8. [ ] Logcat at end shows in this order: `setCameraEnabled(false)` → `OEM_CAMERA_RELEASE_SETTLE_MS` delay → `releaseRoomResources` → `CameraOwnership.release(OWNER_LIVEKIT)`

## 2. Live broadcast — viewer side (N3b, N3c, N3e)

1. [ ] Open same live stream as a viewer on the second device
2. [ ] First frame visible within 2 s
3. [ ] **Active speaker indicator** lights up around host avatar when host talks — confirms N3b `active-speakers-changed` → N3e window event → `useActiveSpeakers` works on native
4. [ ] Toggle **Data Saver** in app settings → bandwidth indicator drops; logcat shows `setSubscriberVideoQuality(quality=LOW)` (N3c)
5. [ ] Toggle audio-only mode → video tile clears; logcat shows `setRemoteVideoSubscribed(subscribed=false)` (N3c)
6. [ ] Toggle back → video resumes within 1 s

## 3. Private call (N3d, N3g)

1. [ ] Initiate 1:1 video call to peer → both sides see video within 2 s
2. [ ] Wait until token TTL nears (set short TTL of 5 min via `livekit-token` edge fn for this test)
3. [ ] At ~4 min mark, force a reconnect (toggle airplane mode 3 s) → reconnect completes; logcat shows `refreshToken applied=true willUseOnReconnect=true` BEFORE reconnect (N3d)
4. [ ] End call → camera LED clears within 2 s (N3g)

## 4. Party room (N3b, N3e, N3f)

1. [ ] Create a party room as host (audio party first)
2. [ ] Set room metadata via host action → both host and viewer see metadata update — confirms N3b `room-metadata-changed` → N3e window event → `useRoomMetadata` works on native
3. [ ] Change own participant metadata (e.g., raise hand) → viewer sees update — confirms `participant-metadata-changed`
4. [ ] If N3f opt-in helpers wired in any feature: confirm RPC round-trip from devtools console (else skip — `livekitNativeMessaging.ts` is currently opt-in only)
5. [ ] Background party for 60 s → return → no double-audio, no participant ghost

## 5. Stress / regression

1. [ ] Rapid go-live ↔ end-live ×10 — camera LED clears every time; no crash; no `Camera in use by another process` toast on the 11th attempt
2. [ ] Camera flip during active reconnect (toggle airplane mid-flip) — recovers without crash
3. [ ] LeakCanary (if installed) → no Room / Activity leaks after 5 go-live cycles

## 6. Console event verification (optional, requires devtools)

Open Chrome devtools → `chrome://inspect` → attach to WebView → in Console:

```js
window.addEventListener('livekit-active-speakers', e => console.log('AS', e.detail));
window.addEventListener('livekit-room-metadata',  e => console.log('RM', e.detail));
window.addEventListener('livekit-participant-metadata', e => console.log('PM', e.detail));
window.addEventListener('livekit-transcription',  e => console.log('TR', e.detail));
```

Trigger each surface from §1–4 and confirm events fire with the right `scope` (`live`/`call`/`party`) and matching `id`.

---

## Reporting

- ✅ All boxes ticked → comment **"N3i PASS"** on the PR / chat
- ❌ Any failure → paste the failing step number + last 20 lines of `LiveKitPlugin` logcat
