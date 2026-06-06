---
name: Pkg432 NativeChatUI plugin
description: Native Android RecyclerView chat overlay for 1000+ message threads at 60fps. Additive, default OFF.
type: feature
---

DONE 2026-06-06.

Goal: WebView chat scroll jank on 1000+ message threads is the most user-felt perf miss after media. RecyclerView with view recycling + per-item layout gives Chamet/Bigo-class smoothness.

Approach (additive, zero regression):
- Native `NativeChatUIPlugin.kt` (Capacitor): overlay FrameLayout added to decor view, hidden by default. `open(currentUserId,title)`, `close()`, `setMessages()`, `appendMessages(stickBottom)`, `prependMessages()`, `clear()`. RecyclerView with LinearLayoutManager+stackFromEnd, itemAnimator=null, GradientDrawable bubbles (my=blue right-aligned, other=slate left-aligned), header bar + tap-to-type send bar. OnScrollListener emits `chatui:loadMore` when reaching top.
- JS bridge `src/plugins/NativeChatUI.ts`: typed interface + no-op shim on web/iOS. `isNativeChatUIAvailable()` helper.
- Hook `src/hooks/useNativeChatUI.ts`: declarative `{enabled,currentUserId,title,onSendIntent,onLoadMore,onTap}` → opens/closes overlay, wires 3 event listeners with ref-stable callbacks, returns `{active,setMessages,appendMessages,prependMessages}`. Caller (Chat.tsx, future) keeps owning DB writes / realtime subs / blocked checks — hook only mirrors render list to native + surfaces intents back.
- Flag `src/utils/chatUINativeFlag.ts`: `localStorage.setItem('chatui:native','on')` opt-in. Default OFF.
- Registered in `MainActivity.java`.

NOT done (deferred):
- Avatar image loading (Glide integration via NativeImageLoader Pkg428).
- Native input/IME (currently send bar just emits `chatui:send` and JS opens existing React input). Full native input would need a EditText + keyboard handling.
- Reactions / long-press menu / reply preview / typing indicator / read receipts.
- Gift / sticker / voice / image / video / system-message item types (text only for now).
- iOS — Android-only plugin.
- Chat.tsx is NOT wired yet. Hook is callable but no caller exists; this is intentional so we can roll out gradually behind the flag.

Files:
- `android/app/src/main/java/com/merilive/app/plugin/NativeChatUIPlugin.kt`
- `src/plugins/NativeChatUI.ts`
- `src/hooks/useNativeChatUI.ts`
- `src/utils/chatUINativeFlag.ts`
- `android/app/src/main/java/com/merilive/app/MainActivity.java` (register)
