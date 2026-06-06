/**
 * Pkg432 — useNativeChatUI hook.
 *
 * Convenience wrapper for opening the native RecyclerView chat overlay and
 * wiring its events back into React. No-op on every non-Android platform
 * and when `chatui:native` flag is OFF.
 *
 * Existing Chat.tsx stays in charge of business logic (DB writes, realtime
 * subs, blocked-user checks). This hook only mirrors the rendered message
 * list into the native overlay and surfaces user-initiated send/loadMore
 * intents back to React.
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
  currentUserId: string | null | undefined;
  title?: string;
  onSendIntent?: () => void;
  onLoadMore?: () => void;
  onTap?: (id: string) => void;
}

export function useNativeChatUI(opts: UseNativeChatUIOpts) {
  const { enabled, currentUserId, title, onSendIntent, onLoadMore, onTap } = opts;
  const openedRef = useRef(false);
  const sendRef = useRef(onSendIntent);
  const loadRef = useRef(onLoadMore);
  const tapRef = useRef(onTap);
  sendRef.current = onSendIntent;
  loadRef.current = onLoadMore;
  tapRef.current = onTap;

  const active = enabled && isNativeChatUIAvailable() && isChatUINativeEnabled() && !!currentUserId;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];
    (async () => {
      try {
        await NativeChatUI.open({ currentUserId: currentUserId!, title });
        if (cancelled) return;
        openedRef.current = true;
        handles.push(
          await NativeChatUI.addListener('chatui:send', () => sendRef.current?.()),
          await NativeChatUI.addListener('chatui:loadMore', () => loadRef.current?.()),
          await NativeChatUI.addListener('chatui:tap', (d: unknown) => {
            const id = (d as { id?: string } | null)?.id;
            if (id) tapRef.current?.(id);
          })
        );
      } catch {
        /* native unavailable — silent fallback */
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

  const prependMessages = useCallback(
    (messages: NativeChatMessage[]) => {
      if (!active) return;
      NativeChatUI.prependMessages({ messages }).catch(() => {});
    },
    [active]
  );

  return { active, setMessages, appendMessages, prependMessages };
}
