/**
 * Pkg437 — useNativeChatUI bridge.
 *
 * Phase-3 of the "complete every incomplete plugin" roadmap. Mirrors an open
 * Chat.tsx thread to the native `NativeChatUI` RecyclerView overlay
 * (Pkg432 infra). Additive — when the flag is OFF, on web/iOS, or on older
 * APKs, every method silently no-ops and React Chat UI is unchanged.
 *
 * Scope (intentional, honest):
 *   - Open/close overlay on conversation switch
 *   - Mirror message list (text + system fallbacks) to native list
 *   - `chatui:send` → calls back into caller's `onSend(text)`
 *   - `chatui:loadMore` → calls `onLoadMore()` (older history)
 *
 * NOT in scope yet (deferred to Phase-3 sub-tasks):
 *   - Native input with mic/attach/gift buttons (React input still owns those)
 *   - Avatar/level/reply previews in adapter (text-only for now)
 *   - Voice/image/video viewholders
 *   - Typing & read-receipt rendering
 *   - Long-press reply/edit/delete popup
 *   - Conversation list (separate page wrap)
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  NativeChatUI,
  isNativeChatUIAvailable,
  type NativeChatMessage,
} from '@/plugins/NativeChatUI';
import { isChatUINativeEnabled } from '@/utils/chatUINativeFlag';

export interface UseNativeChatUIOpts {
  enabled: boolean;
  currentUserId: string | null;
  title?: string;
  onSend?: (text: string) => void;
  onLoadMore?: () => void;
  onTap?: (messageId: string) => void;
}

export function useNativeChatUI(opts: UseNativeChatUIOpts) {
  const { enabled, currentUserId, title, onSend, onLoadMore, onTap } = opts;
  const openedRef = useRef(false);
  const sendRef = useRef(onSend);
  const loadMoreRef = useRef(onLoadMore);
  const tapRef = useRef(onTap);
  sendRef.current = onSend;
  loadMoreRef.current = onLoadMore;
  tapRef.current = onTap;

  const active =
    enabled &&
    !!currentUserId &&
    isNativeChatUIAvailable() &&
    isChatUINativeEnabled();

  useEffect(() => {
    if (!active || !currentUserId) return;
    let cancelled = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];
    (async () => {
      try {
        await NativeChatUI.open({ currentUserId, title });
        if (cancelled) return;
        openedRef.current = true;
        handles.push(
          await NativeChatUI.addListener('chatui:send', (d: unknown) => {
            const text = (d as { text?: string } | null)?.text;
            if (typeof text === 'string' && text.trim()) sendRef.current?.(text.trim());
          }),
          await NativeChatUI.addListener('chatui:loadMore', () => loadMoreRef.current?.()),
          await NativeChatUI.addListener('chatui:tap', (d: unknown) => {
            const id = (d as { id?: string } | null)?.id;
            if (id) tapRef.current?.(id);
          })
        );
      } catch {
        /* native unavailable — silent */
      }
    })();
    return () => {
      cancelled = true;
      handles.forEach((h) => h.remove().catch(() => {}));
      if (openedRef.current) {
        NativeChatUI.close().catch(() => {});
        openedRef.current = false;
      }
    };
  }, [active, currentUserId, title]);

  const setMessages = useCallback(
    (messages: NativeChatMessage[]) => {
      if (!active) return;
      NativeChatUI.setMessages({ messages }).catch(() => {});
    },
    [active]
  );

  const appendMessages = useCallback(
    (messages: NativeChatMessage[], stickBottom = true) => {
      if (!active) return;
      NativeChatUI.appendMessages({ messages, stickBottom }).catch(() => {});
    },
    [active]
  );

  return { active, setMessages, appendMessages };
}
