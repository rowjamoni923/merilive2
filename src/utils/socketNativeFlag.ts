/**
 * Pkg431 — socketNativeFlag
 *
 * Runtime kill-switch for the native Android WebSocket transport.
 * Default **OFF** — Supabase Realtime continues to use the WebView's
 * built-in WebSocket. Flip ON to opt in when transport is wired into
 * the Realtime client (future Pkg).
 *
 *   localStorage.setItem('socket:native', 'on')   // opt in
 *   localStorage.setItem('socket:native', 'off')  // force off
 */
import { isNativeWebSocketAvailable } from '@/plugins/WebSocketBridge';

export function isSocketNativeEnabled(): boolean {
  if (!isNativeWebSocketAvailable()) return false;
  try {
    // Developer Options dial — highest priority.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getNativeFlag } = require('@/utils/nativeFlags') as typeof import('@/utils/nativeFlags');
    if (getNativeFlag('webSocketBridge')) return true;
  } catch { /* noop */ }
  try {
    const v = localStorage.getItem('socket:native');
    if (v === 'on') return true;
    if (v === 'off') return false;
  } catch {
    /* ignore */
  }
  // Default OFF — JS WebSocket inside the WebView remains primary
  // until a future Pkg explicitly wires the native transport into
  // Supabase Realtime + LiveKit signaling.
  return false;
}
