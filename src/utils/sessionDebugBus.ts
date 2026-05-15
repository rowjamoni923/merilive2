/**
 * Session Debug Bus
 *
 * Tiny in-memory ring buffer + EventTarget that records single-device session
 * events (register, realtime subscribe, channel changes, forced logouts) so
 * we can quickly diagnose "why was I logged out?" reports.
 *
 * Enable the on-screen overlay with:
 *   localStorage.setItem('meri_session_debug', '1'); location.reload();
 *
 * From devtools:
 *   __sessionDebug.dump()   // pretty table
 *   __sessionDebug.copy()   // JSON to clipboard
 *   __sessionDebug.clear()
 *   __sessionDebug.enable() / .disable()  // toggle overlay
 */

export type SessionDebugEvent = {
  ts: number;
  type:
    | 'init'
    | 'register'
    | 'register.error'
    | 'check.valid'
    | 'check.invalid'
    | 'check.error'
    | 'channel.subscribe'
    | 'channel.unsubscribe'
    | 'realtime.update'
    | 'realtime.ignored.grace'
    | 'realtime.ignored.unregistered'
    | 'forceLogout'
    | 'grace.start'
    | 'visibility.resume';
  reason?: string;
  data?: Record<string, unknown>;
};

const MAX_EVENTS = 80;
const events: SessionDebugEvent[] = [];
const target = new EventTarget();

let currentChannelName: string | null = null;

export const recordSessionEvent = (
  type: SessionDebugEvent['type'],
  data?: Record<string, unknown>,
  reason?: string
) => {
  const evt: SessionDebugEvent = { ts: Date.now(), type, reason, data };
  events.push(evt);
  if (events.length > MAX_EVENTS) events.shift();
  try {
    target.dispatchEvent(new CustomEvent('event', { detail: evt }));
  } catch {
    /* noop */
  }
};

export const setCurrentChannelName = (name: string | null) => {
  currentChannelName = name;
  try {
    target.dispatchEvent(new CustomEvent('channel', { detail: name }));
  } catch {
    /* noop */
  }
};

export const getCurrentChannelName = () => currentChannelName;
export const getSessionEvents = () => events.slice();

export const onSessionDebug = (cb: () => void) => {
  const handler = () => cb();
  target.addEventListener('event', handler);
  target.addEventListener('channel', handler);
  return () => {
    target.removeEventListener('event', handler);
    target.removeEventListener('channel', handler);
  };
};

// Window helpers — non-prod debug
if (typeof window !== 'undefined') {
  (window as any).__sessionDebug = {
    dump() {
      // eslint-disable-next-line no-console
      console.table(
        events.map((e) => ({
          time: new Date(e.ts).toLocaleTimeString(),
          type: e.type,
          reason: e.reason ?? '',
          data: e.data ? JSON.stringify(e.data) : '',
        }))
      );
      // eslint-disable-next-line no-console
      console.log('[sessionDebug] channel:', currentChannelName);
    },
    copy() {
      const payload = JSON.stringify(
        { channel: currentChannelName, events },
        null,
        2
      );
      navigator.clipboard?.writeText(payload).catch(() => {});
      return payload;
    },
    clear() {
      events.length = 0;
      target.dispatchEvent(new CustomEvent('event', { detail: null }));
    },
    enable() {
      localStorage.setItem('meri_session_debug', '1');
      location.reload();
    },
    disable() {
      localStorage.removeItem('meri_session_debug');
      location.reload();
    },
    isEnabled() {
      return localStorage.getItem('meri_session_debug') === '1';
    },
  };
}
