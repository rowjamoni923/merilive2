/**
 * Pkg431 — WebSocketBridge JS shim
 *
 * Provides a tiny native-socket wrapper plus an optional `NativeWebSocket`
 * class that mimics the standard `WebSocket` interface (readyState,
 * onopen/onmessage/onclose/onerror, send, close). This makes it possible
 * to drop the native socket into Supabase Realtime's `transport` option
 * in a future Pkg without touching call sites.
 *
 * ZERO call sites today — additive plugin only. Guard with
 * `socketNativeFlag` before swapping the default WebSocket transport.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface WebSocketBridgePlugin {
  connect(opts: { url: string; headers?: Record<string, string>; protocol?: string }): Promise<{ socketId: number }>;
  send(opts: { socketId: number; data: string }): Promise<{ queued: boolean }>;
  sendBinary(opts: { socketId: number; data: string /* base64 */ }): Promise<{ queued: boolean }>;
  close(opts: { socketId: number; code?: number; reason?: string }): Promise<void>;
  isOpen(opts: { socketId: number }): Promise<{ open: boolean }>;
  status(): Promise<{ count: number }>;
  addListener(event: 'ws:event', cb: (e: WsEvent) => void): Promise<PluginListenerHandle>;
}

export interface WsEvent {
  socketId: number;
  type: 'open' | 'message' | 'close' | 'error';
  data?: string;
  binary?: boolean;
  code?: number;
  reason?: string;
  message?: string;
  status?: number;
}

const Native = registerPlugin<WebSocketBridgePlugin>('WebSocketBridge');

export const isNativeWebSocketAvailable = (): boolean =>
  Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('WebSocketBridge');

// ---------------- NativeWebSocket — WHATWG-shaped wrapper ----------------

type ReadyState = 0 | 1 | 2 | 3; // CONNECTING / OPEN / CLOSING / CLOSED

/**
 * NativeWebSocket — minimal `WebSocket`-compatible wrapper around the
 * native bridge. Compatible enough for Supabase Realtime's transport
 * option. Does NOT implement: `binaryType`, `extensions`, `bufferedAmount`,
 * `dispatchEvent`/`addEventListener` (use on* handlers instead).
 */
export class NativeWebSocket {
  static CONNECTING: ReadyState = 0;
  static OPEN: ReadyState = 1;
  static CLOSING: ReadyState = 2;
  static CLOSED: ReadyState = 3;

  readyState: ReadyState = NativeWebSocket.CONNECTING;
  readonly url: string;
  readonly protocol: string;

  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  private socketId: number | null = null;
  private listenerHandle: PluginListenerHandle | null = null;
  private pendingSends: string[] = [];
  private static globalListenerRegistered = false;
  private static instances = new Map<number, NativeWebSocket>();

  constructor(url: string, opts?: { headers?: Record<string, string>; protocol?: string }) {
    this.url = url;
    this.protocol = opts?.protocol ?? '';
    if (!isNativeWebSocketAvailable()) {
      // Defer rejection to next tick so onerror can be wired up first
      setTimeout(() => {
        this.readyState = NativeWebSocket.CLOSED;
        try { this.onerror?.(new Event('error')); } catch { /* ignore */ }
        try { this.onclose?.(new CloseEvent('close', { code: 1006, reason: 'native_unavailable' })); } catch { /* ignore */ }
      }, 0);
      return;
    }
    void this.init(opts);
  }

  private async init(opts?: { headers?: Record<string, string>; protocol?: string }) {
    if (!NativeWebSocket.globalListenerRegistered) {
      NativeWebSocket.globalListenerRegistered = true;
      this.listenerHandle = await Native.addListener('ws:event', (e: WsEvent) => {
        const inst = NativeWebSocket.instances.get(e.socketId);
        if (!inst) return;
        inst.handleEvent(e);
      });
    }
    try {
      const { socketId } = await Native.connect({ url: this.url, headers: opts?.headers, protocol: opts?.protocol });
      this.socketId = socketId;
      NativeWebSocket.instances.set(socketId, this);
      // flush queued sends (rare — only if caller called .send() before connect resolved)
      for (const s of this.pendingSends) {
        try { await Native.send({ socketId, data: s }); } catch { /* drop */ }
      }
      this.pendingSends.length = 0;
    } catch (err) {
      this.readyState = NativeWebSocket.CLOSED;
      try { this.onerror?.(new Event('error')); } catch { /* ignore */ }
      try { this.onclose?.(new CloseEvent('close', { code: 1006, reason: String((err as Error)?.message ?? 'connect_failed') })); } catch { /* ignore */ }
    }
  }

  private handleEvent(e: WsEvent) {
    switch (e.type) {
      case 'open':
        this.readyState = NativeWebSocket.OPEN;
        try { this.onopen?.(new Event('open')); } catch { /* ignore */ }
        break;
      case 'message':
        try { this.onmessage?.(new MessageEvent('message', { data: e.data ?? '' })); } catch { /* ignore */ }
        break;
      case 'close':
        this.readyState = NativeWebSocket.CLOSED;
        if (this.socketId != null) NativeWebSocket.instances.delete(this.socketId);
        try { this.onclose?.(new CloseEvent('close', { code: e.code ?? 1005, reason: e.reason ?? '' })); } catch { /* ignore */ }
        break;
      case 'error':
        try { this.onerror?.(new Event('error')); } catch { /* ignore */ }
        break;
    }
  }

  send(data: string | ArrayBuffer | Blob): void {
    if (typeof data !== 'string') {
      // Supabase Realtime always uses JSON strings. Binary support is
      // present in the native plugin (sendBinary), but the WHATWG-shaped
      // wrapper deliberately stays text-only to keep the contract simple.
      throw new Error('NativeWebSocket only supports text frames');
    }
    if (this.socketId == null) {
      this.pendingSends.push(data);
      return;
    }
    if (this.readyState !== NativeWebSocket.OPEN) {
      throw new Error(`NativeWebSocket: readyState=${this.readyState}`);
    }
    void Native.send({ socketId: this.socketId, data });
  }

  close(code = 1000, reason = ''): void {
    this.readyState = NativeWebSocket.CLOSING;
    if (this.socketId == null) return;
    void Native.close({ socketId: this.socketId, code, reason });
  }
}

export default Native;
