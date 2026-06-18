---
name: Pkg501 Private Call face + chat perfection
description: Web preview camera fallback so QA sees faces in Lovable preview, plus JS<->native bridge surface for in-call chat overlay landing in next APK
type: feature
---

# Pkg501 — Private Call: face visibility + chat overlay

## Phase 1 (DONE 2026-06-18, React only, NO APK rebuild)
- `src/components/call/ActiveCallScreen.tsx` — preview-only camera fallback. When `!isNativeAndroidApp() && previewHost`, opens `getUserMedia({video:true})` and mirrors local webcam into BOTH the full-screen primary tile and the PiP tile so the call screen can be verified in Lovable preview without an APK + paired peer. Yellow "PREVIEW MODE" badge prevents confusion. Production web remains blocked by `RequireNativeAndroidGate`.

## Phase 2 surface (DONE 2026-06-18 JS, Kotlin pending next APK)
- `src/plugins/NativeCall.ts` — added two new contract methods:
  - `pushChatMessage({callId, messageId, userId, displayName, avatarUrl, message, isSelf, timestamp})` — JS forwards every accepted incoming peer chat msg into the native PrivateCallActivity chat overlay.
  - `addListener('native-call-chat-send', cb)` — fired by the native composer Send button; JS handler calls `publishChatMessage('call', callId, …)` so LiveKit DataPacket transport stays the single source of truth, and echoes own msg back via `pushChatMessage(isSelf:true)`.
- `src/components/call/ActiveCallScreen.tsx` — bridge useEffect wired: listens to `livekit-chat-message` window event + `NativeCall.addListener('native-call-chat-send')`. Old APKs without `pushChatMessage` silently no-op.

## Phase 3 PENDING in NEXT APK BUILD (Kotlin)
Files to land:
- `android/app/src/main/res/layout/activity_private_call.xml` — add `privateCallChatToggle` ImageButton inside bottom bar + `privateCallChatOverlay` FrameLayout (RecyclerView `privateCallChatList` with fade gradient + LinearLayout `privateCallChatComposer` containing EditText + send ImageButton). Verify `windowSoftInputMode="adjustResize"`.
- `android/app/src/main/java/com/merilive/app/activity/PrivateCallChatAdapter.kt` — new. Own bubble right (tinted), peer bubble left (dark), cap 30 messages.
- `android/app/src/main/java/com/merilive/app/activity/PrivateCallViewModel.kt` — `chatMessages: StateFlow<List<ChatMessage>>` capped at 30.
- `android/app/src/main/java/com/merilive/app/activity/PrivateCallActivity.kt` — bind chat views, observe StateFlow, broadcast receiver for `pushChatMessage`, Send button broadcasts `ACTION_CALL_CHAT_SEND`.
- `android/app/src/main/java/com/merilive/app/plugin/NativeCallPlugin.kt` — implement `pushChatMessage` PluginMethod (sends LocalBroadcast to Activity) + Activity broadcasts `ACTION_CALL_CHAT_SEND` back → plugin notifyListeners('native-call-chat-send').

## Constraints respected
- English-only UI strings.
- LiveKit DataPacket as the SOLE transport — no new Supabase channels.
- Camera continuity sacred — chat overlay never touches the camera path.
- Money/billing/gift paths untouched.
- Old APKs without `pushChatMessage` silently no-op; users see the existing React chat overlay until they update.

## Verification
- Web preview: open private call from owner test account (smdollarex923@gmail.com), confirm yellow "PREVIEW MODE" badge + own camera visible in both tiles + chat input pill at bottom + send/receive bubbles.
- APK (after Phase 3 build): both peers see each other's camera frames within 2s of `connected`, chat toggle reveals composer + bubble list above bottom bar, soft keyboard adjusts layout, msgs round-trip in <300ms via DataPacket.
