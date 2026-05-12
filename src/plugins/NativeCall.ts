/**
 * NativeCall — Step 31.
 *
 * CallKit-style bridge for the native incoming-call surface (full-screen
 * IncomingCallActivity + heads-up notification with Accept / Decline
 * actions). Wires hardware-button taps from the lock screen into the
 * existing usePrivateCall hook so we don't have to poll Supabase.
 *
 * Cold-start safe: actions that fire BEFORE JS attaches a listener
 * (user taps Accept on the lock screen → app launches → React mounts)
 * are buffered natively and flushed via `getLastAction()` or the first
 * `addListener('call-action', …)` registration.
 */

import { registerPlugin, Capacitor, type PluginListenerHandle } from '@capacitor/core';

export type NativeCallAction =
  | 'accept'
  | 'decline'
  | 'timeout'
  | 'dismissed'
  | 'presented';

export interface NativeCallActionEvent {
  callId: string;
  callerId: string;
  callerName: string;
  callType: 'video' | 'audio' | string;
  action: NativeCallAction;
  /** ms epoch when the action was captured natively. */
  ts: number;
}

export interface NativeCallPlugin {
  isAvailable(): Promise<{ available: boolean; backend: string }>;
  /** Drain actions that fired before JS attached a listener. */
  getLastAction(): Promise<{ actions: NativeCallActionEvent[] }>;
  /** Optional book-keeping ack so duplicate native dispatches collapse. */
  acknowledgeAction(opts: { callId: string; action: NativeCallAction }): Promise<{ ack: boolean }>;
  /**
   * Dismiss the heads-up notification + finish() the IncomingCallActivity.
   * Use when the call is resolved server-side (cancelled, answered
   * elsewhere, ringer timed out, etc).
   */
  endIncomingUi(opts: { callId: string; reason?: string }): Promise<{ dismissed: boolean; callId: string }>;

  addListener(
    eventName: 'call-action',
    cb: (e: NativeCallActionEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export const NativeCall = registerPlugin<NativeCallPlugin>('NativeCall');

/** True only when the native CallKit-style plugin is available. */
export function isNativeCallAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}
