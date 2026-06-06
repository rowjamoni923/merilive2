/**
 * Pkg432 — NativeChatUI JS bridge.
 *
 * Thin wrapper over the Android `NativeChatUI` Capacitor plugin. Renders a
 * RecyclerView-backed chat overlay capable of 1000+ messages at 60fps.
 *
 * Default OFF. Existing Chat.tsx React UI is untouched. Opt in via
 * `chatUINativeFlag` and explicit `openNativeChat()` call.
 *
 * No-op on web / iOS / older APKs — every method silently resolves so callers
 * never need to branch.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface NativeChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  createdAt: number;
  avatarUrl?: string | null;
}

export interface NativeChatUIPlugin {
  open(opts: { currentUserId: string; title?: string }): Promise<void>;
  close(): Promise<void>;
  setMessages(opts: { messages: NativeChatMessage[] }): Promise<void>;
  appendMessages(opts: {
    messages: NativeChatMessage[];
    stickBottom?: boolean;
  }): Promise<void>;
  prependMessages(opts: { messages: NativeChatMessage[] }): Promise<void>;
  clear(): Promise<void>;
  addListener(
    eventName: 'chatui:send' | 'chatui:loadMore' | 'chatui:tap',
    listenerFunc: (data: unknown) => void
  ): Promise<PluginListenerHandle>;
}

const noop: NativeChatUIPlugin = {
  open: async () => {},
  close: async () => {},
  setMessages: async () => {},
  appendMessages: async () => {},
  prependMessages: async () => {},
  clear: async () => {},
  addListener: async () => ({ remove: async () => {} }) as PluginListenerHandle,
};

const impl: NativeChatUIPlugin =
  Capacitor.getPlatform() === 'android'
    ? registerPlugin<NativeChatUIPlugin>('NativeChatUI', { web: noop })
    : noop;

export const NativeChatUI = impl;

export function isNativeChatUIAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform();
}
