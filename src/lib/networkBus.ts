/**
 * Pkg243 — Push-based connectivity bus.
 *
 * Why: navigator.onLine + window 'online'/'offline' events are slow + flaky on
 * Android WebView (only fire when JS engine notices). Capacitor's @capacitor/network
 * plugin on Android uses ConnectivityManager.NetworkCallback under the hood, which
 * is a *real* OS push signal — fires the millisecond Wi-Fi/cell flips, including
 * metered/VPN/captive transitions. This bus subscribes ONCE per app, fans out to
 * every listener, and exposes connection-type + transition deltas so consumers
 * (DM outbox drain, LiveKit reconnect, room protection) can react instantly
 * instead of polling.
 *
 * Web fallback: window 'online'/'offline' + navigator.onLine.
 *
 * Replaces scattered window.addEventListener('online') usage across the app.
 */

export type ConnectionType =
  | 'wifi'
  | 'cellular'
  | 'ethernet'
  | 'unknown'
  | 'none';

export interface NetworkSnapshot {
  connected: boolean;
  type: ConnectionType;
  /** True when this snapshot is the transition offline → online. */
  reconnected: boolean;
}

type Listener = (snap: NetworkSnapshot) => void;

const listeners = new Set<Listener>();
let lastSnap: NetworkSnapshot = {
  connected: typeof navigator !== 'undefined' ? navigator.onLine : true,
  type: 'unknown',
  reconnected: false,
};
let initialized = false;

function emit(next: Omit<NetworkSnapshot, 'reconnected'>) {
  const reconnected = !lastSnap.connected && next.connected;
  const sameConnected = lastSnap.connected === next.connected;
  const sameType = lastSnap.type === next.type;
  // Always update lastSnap snapshot
  lastSnap = { ...next, reconnected };
  // Skip emit when nothing changed AND not a reconnect transition
  if (sameConnected && sameType && !reconnected) return;
  listeners.forEach((fn) => {
    try {
      fn(lastSnap);
    } catch (e) {
      console.warn('[networkBus] listener threw', e);
    }
  });
}

async function init() {
  if (initialized) return;
  initialized = true;

  // Web events — always wire so desktop browsers also drive the bus.
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => emit({ connected: true, type: lastSnap.type === 'none' ? 'unknown' : lastSnap.type }));
    window.addEventListener('offline', () => emit({ connected: false, type: 'none' }));
  }

  // Native (Capacitor) — push-based NetworkCallback on Android.
  try {
    const { Network } = await import('@capacitor/network');
    const status = await Network.getStatus();
    emit({
      connected: status.connected,
      type: (status.connectionType as ConnectionType) || 'unknown',
    });
    await Network.addListener('networkStatusChange', (s) => {
      emit({
      });
    });
  } catch {
    // Web: capacitor plugin unavailable, web events already wired above.
  }
}

export const networkBus = {
  /** Current snapshot (synchronous). */
  get(): NetworkSnapshot {
    return lastSnap;
  },
  /**
   * Subscribe to network transitions. Returns unsubscribe.
   * Initializes the underlying OS listener on first call.
   */
  subscribe(fn: Listener): () => void {
    void init();
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  /** Whether the device is currently online. */
  isOnline(): boolean {
    return lastSnap.connected;
  },
  /** True for metered/cellular — useful to throttle big uploads. */
  isMetered(): boolean {
    return lastSnap.type === 'cellular';
  },
};
