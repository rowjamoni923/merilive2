# Private Call — Face + Chat Perfection (Web + Android Native)

## Problems (verified)

**Problem 1 — দুইজন দুইজনের face দেখা যায় না**
- **Android native** (`PrivateCallActivity.kt`): `attachLocal` PluginMethod fix shipped 2026-06-17 but APK rebuild হয়নি → পুরনো APK-এ এখনো local renderer mount হয় না → নিজের preview white/black, আর peer-ও partial।
- **Web preview** (`ActiveCallScreen.tsx`): UI ঠিক আছে কিন্তু `useLiveKitCall` Android-native-only পথে gate করা — preview-এ `shouldUseNativeLiveKit` false হলেও web getUserMedia path বন্ধ → কোন track-ই publish হয় না → both faces blank।

**Problem 2 — message option নাই**
- **Android native** `activity_private_call.xml` + `PrivateCallActivity.kt`-এ **chat surface সম্পূর্ণ অনুপস্থিত** — শুধু mic / speaker / flip / gift / end button আছে। কোনো EditText / RecyclerView / message bubble নেই।
- **Web** `ActiveCallScreen.tsx`-এ chat input + bubble overlay already আছে (line 1186–1242, 1296–1329)। কিন্তু native PrivateCallActivity যখন foreground-এ ওঠে, React side `nativeInCallOpen=true` → পুরো React UI hide → chat-ও invisible হয়ে যায়।

## Industry research (Chamet / Bigo / Olamet / Poppo)

- **Layout**: full-screen remote video + draggable PiP local + bottom action bar + **chat overlay above bottom bar** (semi-transparent, last 20–30 messages, fades old)। Tap chat button → soft keyboard rise → composer pill। সব apps-এ chat call screen-এর integral part, alone overlay না।
- **Transport**: gift / chat / signaling সব **LiveKit DataPacket** (reliable=true)। আমাদের `livekitChatSignaling.ts` (Pkg79, scope='call') already এই pattern follow করে।
- **Native ↔ JS bridge**: native chat UI JS-এর `publishChatMessage('call', …)` কে কল করবে broadcast intent দিয়ে; receive side JS event → broadcast → native RecyclerView adapter। এতে money path (`stream_chat` row বা billing) untouched থাকে।
- **Camera**: both faces visible from the **first connected frame**; race-free `attachLocal` MUST mount renderer even if `LocalParticipant` not yet ready (deferred attach when track publishes)।

## Fix plan

### Phase 1 — Web preview face visibility (React only, no APK)
File: `src/components/call/ActiveCallScreen.tsx`
- Detect preview host (`isPreviewHost` from existing `RequireNativeAndroidGate`)। যদি `!isNativeAndroidApp() && previewBypass` হয়, then run a **lightweight web fallback path**: open `getUserMedia({video:true,audio:true})` and render the MediaStream in both local PiP + remote slot (echo) so QA face দেখতে পায়। **Strictly preview-only**, production web blocked unchanged।
- Add visible "Preview mode — your own camera mirrored to both tiles" badge so it's never confused with real peer video।

### Phase 2 — Native chat overlay (Android, Kotlin)

**2a. Layout** — extend `activity_private_call.xml`:
- Add `privateCallChatToggle` ImageButton inside bottom bar (between Flip and Gift)।
- Add `privateCallChatOverlay` FrameLayout (above bottom bar, below top overlay):
  - `RecyclerView` `privateCallChatList` (transparent bg, last 30 msgs, fade gradient mask)
  - `LinearLayout` `privateCallChatComposer` (visible only when toggled): `EditText` + `ImageButton send`
- Adjust `android:windowSoftInputMode="adjustResize"` already in manifest — verify।

**2b. Adapter + ViewModel state**
- New `ChatMessage` data class + `PrivateCallChatAdapter` (own bubble = right tinted, peer = left dark)।
- `PrivateCallViewModel`: `StateFlow<List<ChatMessage>>` capped at 30, append-only।

**2c. Bridge ↔ JS** (extend existing `NativeCallPlugin`):
- **Outbound** (native → JS): when user taps send, broadcast `ACTION_CALL_CHAT_SEND` with `{callId, text, clientId}` → Capacitor plugin emits `call-chat-send-from-native` window event → existing JS handler calls `publishChatMessage('call', callId, …)` + optimistic add।
- **Inbound** (JS → native): existing `window.addEventListener('livekit-chat-message', …)` already fires for incoming peer msgs। Add new bridge: when native call window is foreground, JS forwards each call-scope event to native via `NativeCall.pushChatMessage({…})` → broadcast → adapter prepends + scroll।
- Own-sent native msgs also echo back via same JS event so the source of truth stays single (LiveKit DataPacket)।

**2d. Lifecycle**
- Drain pending msgs on Activity resume; clear on `onDestroy`।
- FLAG_SECURE preserved (chat scrolls inside the secured surface)।

### Phase 3 — APK rebuild prerequisite
- Phase 2 + পুরনো `attachLocal` fix দুটোই APK rebuild ছাড়া live হবে না। Honest message to user: "Native চাঁদে fix push হয়ে গেছে but APK rebuild + reinstall করতে হবে। Web preview-এ Phase 1-এর fallback দিয়ে immediate test করতে পারবে।"

## Files touched

**React (immediate, no rebuild)**
- `src/components/call/ActiveCallScreen.tsx` — preview camera fallback + native-chat bridge dispatch

**Kotlin (APK rebuild required)**
- `android/app/src/main/res/layout/activity_private_call.xml` — chat overlay + toggle
- `android/app/src/main/java/com/merilive/app/activity/PrivateCallActivity.kt` — bind chat views + broadcast bridge + scroll on new msg
- `android/app/src/main/java/com/merilive/app/activity/PrivateCallViewModel.kt` — `chatMessages` StateFlow
- New: `android/app/src/main/java/com/merilive/app/activity/PrivateCallChatAdapter.kt`
- `android/app/src/main/java/com/merilive/app/plugin/NativeCallPlugin.kt` — `pushChatMessage` method + `ACTION_CALL_CHAT_*` actions + `addListener('call-chat-send-from-native')`
- `src/plugins/NativeCall.ts` — TS surface for the two new methods

## Out of scope (separate packages)
- Voice-to-text, emoji picker, gift-trigger from chat input
- Long-press reactions, message reply threading
- Old-message persistence (chat is ephemeral, in-call only — matches Chamet)
- Party / live chat (already shipped via Pkg79)

## Constraints respected
- English-only UI strings (memory)
- LiveKit DataPacket only, NO new Supabase channels (memory)
- Camera continuity sacred — chat overlay never re-inits camera (memory)
- Money path untouched (gift, billing routes unchanged)
- Design-sacred lifted → bottom bar restyle permitted
