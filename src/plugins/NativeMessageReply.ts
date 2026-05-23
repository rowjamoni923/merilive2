/**
 * Pkg209 — NativeMessageReply bridge.
 *
 * Receives inline-reply / mark-as-read actions captured natively from
 * the DM notification shade (RemoteInput) and surfaces them to the JS
 * layer so the durable Supabase write runs under the user's own JWT.
 */
import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';

export type NativeMessageActionType = 'reply' | 'mark_read';

export interface NativeMessageAction {
  type: NativeMessageActionType;
  conversationId: string;
  senderId: string;
  /** Trimmed reply text. Empty for `mark_read`. */
  body: string;
  /** ms epoch when the action was captured natively. */
  ts: number;
}

export interface NativeMessageReplyPlugin {
  /** Drain replies + mark-read events queued while the process was dead. */
  drainPending(): Promise<{ actions: NativeMessageAction[] }>;
  addListener(
    eventName: 'message-action',
    cb: (e: NativeMessageAction) => void,
  ): Promise<PluginListenerHandle>;
}

export const NativeMessageReply = registerPlugin<NativeMessageReplyPlugin>('NativeMessageReply');

export function isNativeMessageReplyAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}
