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
  | 'presented'
  // Pkg-audit Phase-A: emitted by MeriConnection.onDisconnect when the user
  // ends an ALREADY-active call from a BT headset / system controls / lock-
  // screen. Distinct from 'decline' (pre-accept reject).
  | 'ended'
  // Telecom hold / unhold — fired when the OS pauses our VoIP call for a
  // PSTN call-waiting interrupt (and resumes after the PSTN call ends).
  // Native side already mutes local mic + camera; JS just updates UI state.
  | 'hold'
  | 'unhold'
  // PrivateCallActivity end button dispatches this action before JS settles
  // the call and closes native media.
  | 'end';

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

  // ---- Pkg208 — Telecom / self-managed ConnectionService ---------------
  /** Whether the device + API level support Telecom self-managed calls. */
  isTelecomSupported(): Promise<{ supported: boolean }>;
  /** Idempotent. Registers our SELF_MANAGED PhoneAccount with the OS. */
  registerPhoneAccount(): Promise<{ registered: boolean; supported: boolean }>;
  /**
   * Push an incoming call into Telecom so BT headset Answer/End buttons,
   * the system call log, and OS audio routing all work. Our heads-up
   * notification + IncomingCallActivity remain the visible UI.
   */
  reportIncomingCall(opts: {
    callId: string;
    callerId: string;
    callerName: string;
    callType?: 'video' | 'audio';
  }): Promise<{ reported: boolean; callId: string }>;
  /**
   * Pkg211 — Outgoing call: place via Telecom so BT End button + OS audio
   * routing + system call-log entry work for caller side. Safe no-op on
   * unsupported devices.
   */
  reportOutgoingCall(opts: {
    callId: string;
    calleeId: string;
    calleeName: string;
    callType?: 'video' | 'audio';
  }): Promise<{ reported: boolean; callId: string }>;
  /** Mark the Telecom connection as connected (media flowing). */
  reportCallConnected(opts: { callId: string }): Promise<{ ok: boolean; callId: string }>;
  /** Tear down the Telecom connection (releases audio focus + closes log entry). */
  reportCallEnded(opts: { callId: string; remote?: boolean }): Promise<{ ok: boolean; callId: string }>;

  // ---- Pkg500 Phase B — Native PrivateCallActivity launcher --------------
  /**
   * Returns whether this APK ships the native PrivateCallActivity. Older
   * APKs return false so JS falls back to the existing /call/active web
   * screen — guarantees zero breakage during the rollout.
   */
  hasInCallActivity(): Promise<{ available: boolean }>;
  /**
   * Launch the native PrivateCallActivity. Caller MUST have already
   * connected LiveKitPlugin to the call room (single-camera contract,
   * Pkg416). Activity adopts the existing Room via RtcEngineManager and
   * bails out if none is bound.
   */
  openInCallActivity(opts: {
    callId: string;
    peerId: string;
    peerName?: string;
    peerAvatar?: string | null;
    isCaller?: boolean;
    livekitUrl: string;
    livekitToken: string;
  }): Promise<{ opened: boolean; callId: string }>;
  /**
   * Ask the active PrivateCallActivity to finish itself (server says call
   * ended, peer hung up via web, low-balance grace expired, etc).
   * Empty callId = close any active call Activity.
   */
  closeInCallActivity(opts: { callId?: string }): Promise<{ ok: boolean }>;

  /**
   * Pkg500 Phase G — bring the PrivateCallActivity back to fullscreen after
   * an inline action (gift sheet, recharge sheet, etc) opened in the WebView.
   * Native-side this exits PIP and moves the call task to the foreground.
   * No-op on older APKs / web / iOS.
   */
  resumeInCallActivity(): Promise<{ ok: boolean }>;

  // ---- Pkg500 Phase D — In-call billing sync (caller-side) --------------
  /**
   * Push the latest billing snapshot into the active PrivateCallActivity.
   * Call every time the server bills another minute, the caller recharges,
   * or the per-minute rate changes mid-call. Activity stores the values
   * and ticks down 1Hz locally between pushes (so the low-balance banner
   * countdown never freezes between server billing intervals).
   *
   * No-op when no PrivateCallActivity is running.
   */
  updateInCallBilling(opts: {
    callId: string;
    balance: number;
    ratePerMinute: number;
  }): Promise<{ ok: boolean }>;

  // ---- Pkg501 — Native in-call chat overlay (PrivateCallActivity) -------
  /**
   * Push a single incoming chat message into the active PrivateCallActivity
   * chat overlay. JS continues to own the LiveKit DataPacket transport via
   * livekitChatSignaling.publishChatMessage(); this is purely a UI mirror so
   * the native RecyclerView shows peer messages while the Activity covers
   * the WebView. No-op when no PrivateCallActivity is foreground. Older
   * APKs without the chat surface return `{ ok: false }` and JS falls back
   * to its own React chat overlay.
   */
  pushChatMessage(opts: {
    callId: string;
    messageId: string;
    userId: string;
    displayName?: string;
    avatarUrl?: string | null;
    message: string;
    isSelf: boolean;
    timestamp: number;
  }): Promise<{ ok: boolean }>;

  addListener(
    eventName: 'call-action',
    cb: (e: NativeCallActionEvent) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Pkg500 Phase D — fired when the caller taps the Recharge CTA inside
   * the active PrivateCallActivity. JS responds by opening the existing
   * recharge sheet; the call stays connected behind it.
   */
  addListener(
    eventName: 'recharge-requested',
    cb: (e: { callId: string; ts: number }) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Pkg500 Phase E — emitted by PrivateCallEndActivity (post-call summary)
   * and the in-call Gift button. Possible `action` values:
   *   "gift"         — caller tapped "Send a gift" on the end screen
   *   "gift_inline"  — caller tapped the in-call Gift button
   *   "recharge"     — caller tapped "Recharge wallet"
   *   "rate"         — caller tapped a star (rating is 1..5)
   *   "close"        — end-screen dismissed
   *   "wallet"       — host tapped "Open wallet"
   *   "go_live"      — host tapped "Go live"
   */
  addListener(
    eventName: 'call-end-action',
    cb: (e: {
      callId: string;
      peerId: string;
      action: 'gift' | 'gift_inline' | 'recharge' | 'rate' | 'close' | 'wallet' | 'go_live';
      rating?: number;
      ts: number;
    }) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Phase 2 — native PrivateCallActivity window lifecycle. Fires when the
   * Activity comes to the front (`state: "opened"`) and when it is destroyed
   * (`state: "closed"`). CallProvider uses this to keep React in lockstep with
   * the native call surface: while "opened", React stops hiding #root (the
   * Activity already covers the screen) and skips repainting the call shell.
   */
  addListener(
    eventName: 'native-call-window',
    cb: (e: { callId: string; state: 'opened' | 'closed'; ts: number }) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Pkg501 — fired when the user taps Send inside the native chat composer
   * of PrivateCallActivity. JS responds by calling
   * livekitChatSignaling.publishChatMessage('call', callId, …) so the
   * DataPacket transport stays the single source of truth.
   */
  addListener(
    eventName: 'native-call-chat-send',
    cb: (e: { callId: string; clientId: string; text: string; ts: number }) => void,
  ): Promise<PluginListenerHandle>;

  /**
   * Background continuity (2026-07-03) — start a camera+mic foreground
   * service so LiveKit publish stays alive when the WebView is minimized.
   * Called by LiveStream host + PartyRoom host/speaker on publish start.
   */
  startBroadcastForegroundService(opts: {
    kind: 'live' | 'party';
    title?: string;
  }): Promise<{ ok: boolean; kind?: string; reason?: string }>;
  stopBroadcastForegroundService(): Promise<{ ok: boolean }>;
}


export const NativeCall = registerPlugin<NativeCallPlugin>('NativeCall');

/** True only when the native CallKit-style plugin is available. */
export function isNativeCallAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

/**
 * Pkg500 Phase B — true when this APK has the native PrivateCallActivity.
 * Older APKs (pre-Pkg500) return false → JS keeps using the web fallback at
 * /call/active. Cached per session so the branch is cheap.
 */
let _hasInCallCache: boolean | null = null;
export async function hasNativeInCallActivity(): Promise<boolean> {
  if (!isNativeCallAvailable()) return false;
  if (_hasInCallCache !== null) return _hasInCallCache;
  try {
    const r = await NativeCall.hasInCallActivity();
    _hasInCallCache = !!r?.available;
  } catch {
    _hasInCallCache = false;
  }
  return _hasInCallCache;
}

/**
 * Background continuity helper — safe on web/iOS/older APKs (returns false).
 * Starts CallForegroundService with mode=live so Android's OS keeps our
 * LiveKit publish alive when the user hits Home. Idempotent.
 */
export async function startBroadcastFgs(
  kind: 'live' | 'party',
  title?: string,
): Promise<boolean> {
  if (!isNativeCallAvailable()) return false;
  try {
    const r = await NativeCall.startBroadcastForegroundService({ kind, title });
    return !!r?.ok;
  } catch {
    return false;
  }
}

export async function stopBroadcastFgs(): Promise<void> {
  if (!isNativeCallAvailable()) return;
  try { await NativeCall.stopBroadcastForegroundService(); } catch { /* ignore */ }
}


