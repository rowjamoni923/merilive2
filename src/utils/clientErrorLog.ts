/**
 * Lightweight client-side error logger for user-facing pages.
 * - In dev: forwards to console.error so debugging is unchanged.
 * - In prod: silenced (no console noise, no PII leak in DevTools).
 * - Never touches admin error log table; keeps user pages cost-free.
 */
export interface ClientErrorPayload {
  label: string;
  message: unknown;
}

const isDev =
  typeof import.meta !== "undefined" &&
  (import.meta as any).env &&
  (import.meta as any).env.DEV === true;

export function recordClientError(payload: ClientErrorPayload): void {
  if (isDev) {
    // eslint-disable-next-line no-console
    console.error(`[${payload.label}]`, payload.message);
  }
}
