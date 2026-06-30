/**
 * Pkg-call-diag — in-app diagnostics ring buffer for live / party / private-call.
 *
 * Records timestamped events for:
 *   - Native renderer attach / detach (local + remote, surface bind + global attach)
 *   - Surface mode transitions (bounded vs. fullscreen vs. preview)
 *   - Overlay visibility (header, chat, gifts, message box, entry bars)
 *   - Connect / disconnect, media epoch flips
 *   - Errors + retry exhaustion
 *
 * Read from devtools:
 *   (await import('/src/lib/callDiagnostics.ts')).getCallDiagnostics()
 *   window.__meriliveCallDiag.dump()
 *
 * Listen for new events:
 *   window.addEventListener('merilive-call-diag', (e) => console.log(e.detail));
 *
 * Buffer is bounded (200 entries) and zero-cost on platforms without an issue —
 * a single push + slice when overflowing. Safe to call from any layer; never
 * throws to the caller.
 */

export type CallDiagCategory =
  | 'native-attach'
  | 'native-detach'
  | 'surface-mode'
  | 'overlay'
  | 'session'
  | 'media-epoch'
  | 'error';

export type CallDiagLevel = 'info' | 'warn' | 'error';

export interface CallDiagEvent {
  /** epoch ms */
  ts: number;
  /** ms since first event recorded after page load (useful for sequencing) */
  rel: number;
  category: CallDiagCategory;
  level: CallDiagLevel;
  /** Short stable label, e.g. 'attachLocal', 'attachRemoteSurface', 'overlay:chat'. */
  label: string;
  /** Free-form structured detail. Keep small (<1 KB) — already JSON-stringifiable. */
  detail?: Record<string, unknown>;
}

const MAX_ENTRIES = 200;
export const CALL_DIAG_EVENT = 'merilive-call-diag';

const BUFFER: CallDiagEvent[] = [];
let originTs = 0;

function pushEvent(ev: Omit<CallDiagEvent, 'ts' | 'rel'>): CallDiagEvent {
  const now = Date.now();
  if (originTs === 0) originTs = now;
  const full: CallDiagEvent = { ts: now, rel: now - originTs, ...ev };
  BUFFER.push(full);
  if (BUFFER.length > MAX_ENTRIES) BUFFER.splice(0, BUFFER.length - MAX_ENTRIES);

  try {
    const prefix = `[call-diag:${ev.category}]`;
    const args: unknown[] = [prefix, ev.label];
    if (ev.detail) args.push(ev.detail);
    if (ev.level === 'error') console.error(...args);
    else if (ev.level === 'warn') console.warn(...args);
    else console.info(...args);
  } catch { /* ignore */ }

  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CALL_DIAG_EVENT, { detail: full }));
    }
  } catch { /* ignore */ }

  return full;
}

export function recordCallDiag(
  category: CallDiagCategory,
  label: string,
  detail?: Record<string, unknown>,
  level: CallDiagLevel = 'info',
): void {
  try { pushEvent({ category, label, detail, level }); }
  catch { /* never throw to caller */ }
}

export function getCallDiagnostics(): readonly CallDiagEvent[] {
  return BUFFER.slice();
}

export function clearCallDiagnostics(): void {
  BUFFER.length = 0;
  originTs = 0;
}

/** Pretty multi-line dump suitable for copy/paste in a bug report. */
export function dumpCallDiagnostics(): string {
  return BUFFER
    .map((e) => {
      const t = new Date(e.ts).toISOString().split('T')[1]?.replace('Z', '') ?? '';
      const det = e.detail ? ' ' + safeStringify(e.detail) : '';
      return `${t} +${e.rel}ms [${e.level}] ${e.category} ${e.label}${det}`;
    })
    .join('\n');
}

function safeStringify(v: unknown): string {
  try { return JSON.stringify(v); } catch { return '[unserializable]'; }
}

/**
 * Observe an overlay element's visibility and record category='overlay'
 * events whenever it appears, disappears, or changes size meaningfully.
 *
 * Call from a `useEffect` and invoke the returned disposer on cleanup.
 * `label` should match a stable id like `live:header`, `call:chat`, `party:gift`.
 */
export function trackOverlayVisibility(
  el: Element | null,
  label: string,
): () => void {
  if (!el || typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
    return () => { /* noop */ };
  }
  let lastVisible: boolean | null = null;
  let lastWidth = -1;
  let lastHeight = -1;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const visible = entry.isIntersecting && entry.intersectionRatio > 0;
      const w = Math.round(entry.boundingClientRect.width);
      const h = Math.round(entry.boundingClientRect.height);
      const sizeChanged = Math.abs(w - lastWidth) > 2 || Math.abs(h - lastHeight) > 2;
      if (visible !== lastVisible || (visible && sizeChanged)) {
        recordCallDiag('overlay', label, {
          visible,
          width: w,
          height: h,
          ratio: Number(entry.intersectionRatio.toFixed(2)),
        });
        lastVisible = visible;
        lastWidth = w;
        lastHeight = h;
      }
    }
  }, { threshold: [0, 0.01, 0.5, 1] });

  observer.observe(el);
  return () => { try { observer.disconnect(); } catch { /* ignore */ } };
}

// Expose a small global for the user / QA to read from the in-app
// devtools console without an import statement.
if (typeof window !== 'undefined') {
  (window as unknown as { __meriliveCallDiag?: unknown }).__meriliveCallDiag = {
    get: getCallDiagnostics,
    dump: dumpCallDiagnostics,
    clear: clearCallDiagnostics,
    record: recordCallDiag,
  };
}
