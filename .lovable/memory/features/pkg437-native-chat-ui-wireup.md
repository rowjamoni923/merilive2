---
name: Pkg437 NativeChatUI wire-up (Phase 3)
description: Wire NativeChatUI plugin into Chat.tsx open DM thread (additive overlay, default OFF, text payload only).
type: feature
---

DONE 2026-06-06. Phase 3 of "complete all incomplete plugins" roadmap (Pkg435-440).

Chat.tsx now mirrors the open DM thread to the native RecyclerView chat overlay via new `useNativeChatUI` hook (Pkg432 infra). When the `chatui:native` flag (or DevOptions `chatUINative`/`nativeChatUI`) is ON and platform is Android-native AND `selectedConversation` is open, the overlay opens with `title = other_user.display_name`. `chatui:send` event from the native input → `handleSend(text)` (signature widened to accept `overrideText?: string`). React Chat UI underneath stays canonical.

Message mapping: text messages pass through. Non-text get a 1-line text fallback (`🎁 ${name}` for gifts, `🎙️ Voice message`, `🖼️ Image`, `🎬 Video`, `📎 File`). senderName = "You" or other_user.display_name; avatar = other_user.avatar_url for incoming, null for outgoing.

NOT in scope (deferred — needs separate native VHs + signature additions on the plugin):
- Avatar circle/level badge/reply preview in adapter (text-only rows for now)
- Voice waveform / image thumbnail / video player viewholders
- Typing indicator + read-receipt rendering
- Long-press reply/edit/delete popup menu
- Gift / mic / attach / live-game / sticker / call buttons in native input bar (React UI still owns those — when overlay is on, those buttons stay hidden underneath)
- Conversation list page replacement (only the open-thread surface)
- Group thread mirroring (only 1:1 DMs)

Files:
- NEW `src/hooks/useNativeChatUI.ts` — open/close + listeners + setMessages/appendMessages
- `src/pages/Chat.tsx` — import + handleSend(overrideText) signature + memoized native payload + bridge effect; existing onKeyDown/onClick send-button callers shimmed to drop the MouseEvent arg (build-error fix).

Roll forward: enable for small Android cohort via DevOptions → "Native Chat UI", verify list scroll fps + tap routing + send round-trip, then graduate to default ON in `chatUINativeFlag.ts`. Phase 3 sub-tasks (Pkg437.1–.8) to follow when rich VHs are needed.
