/**
 * Permission Debug Log
 * --------------------
 * In-memory ring buffer + console mirror for every step of the native
 * permission flow. Helps diagnose which step caused a permanent denial
 * on a real Android device when remote ADB Logcat isn't available.
 *
 * Usage from Chrome WebView devtools console (chrome://inspect):
 *   __permDebug.dump()   // pretty table of all events
 *   __permDebug.get()    // raw array
 *   __permDebug.clear()  // reset buffer
 *   __permDebug.copy()   // copy JSON to clipboard
 */

export type PermStep =
  | 'check.start' | 'check.result'
  | 'canRequest.start' | 'canRequest.result'
  | 'requestAll.start' | 'requestAll.result' | 'requestAll.error'
  | 'requestCamera.start' | 'requestCamera.result' | 'requestCamera.error'
  | 'requestMic.start' | 'requestMic.result' | 'requestMic.error'
  | 'requestNotif.start' | 'requestNotif.result' | 'requestNotif.error'
  | 'requestLocation.start' | 'requestLocation.result' | 'requestLocation.error'
  | 'gate.mount' | 'gate.refresh' | 'gate.allowTap' | 'gate.allowDone'
  | 'gate.openSettings' | 'gate.resume' | 'gate.permanentDenyDetected'
  | 'openSettings.invoke';

interface PermLogEntry {
  t: number;          // ms since epoch
  iso: string;        // ISO timestamp
  step: PermStep;
  data?: Record<string, unknown>;
}

const MAX_ENTRIES = 250;
const buffer: PermLogEntry[] = [];

export function permLog(step: PermStep, data?: Record<string, unknown>) {
  const now = Date.now();
  const entry: PermLogEntry = {
    t: now,
    iso: new Date(now).toISOString(),
    step,
    data,
  };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
  // eslint-disable-next-line no-console
  console.info(`[PermDebug] ${step}`, data ?? '');
}

export function getPermissionDebugLog(): PermLogEntry[] {
  return [...buffer];
}

export function clearPermissionDebugLog() {
  buffer.length = 0;
}

export function dumpPermissionDebugLog() {
  // eslint-disable-next-line no-console
  console.table(
    buffer.map((e) => ({
      time: e.iso.split('T')[1].replace('Z', ''),
      step: e.step,
      data: e.data ? JSON.stringify(e.data) : '',
    })),
  );
  return buffer;
}

export function copyPermissionDebugLog(): Promise<void> {
  const text = JSON.stringify(buffer, null, 2);
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  // eslint-disable-next-line no-console
  console.log(text);
  return Promise.resolve();
}

// Expose on window for easy access from WebView devtools.
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__permDebug = {
    dump: dumpPermissionDebugLog,
    get: getPermissionDebugLog,
    clear: clearPermissionDebugLog,
    copy: copyPermissionDebugLog,
  };
}
