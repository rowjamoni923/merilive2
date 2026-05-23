import { Analytics } from "@/plugins/Analytics";

/**
 * Pkg223 / M18 — Privacy consent + analytics opt-out.
 *
 * Stored in localStorage so it is consulted before any analytics call.
 * Possible states:
 *   - null         → user has not been asked yet (show consent dialog)
 *   - "granted"    → opted in, analytics + crashlytics on
 *   - "denied"     → opted out, both disabled
 */
export type ConsentState = "granted" | "denied" | null;

const KEY = "meri_analytics_consent";
const EVENT = "meri:analytics-consent-changed";

export function getConsent(): ConsentState {
  try {
    const v = localStorage.getItem(KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(state: Exclude<ConsentState, null>) {
  try {
    localStorage.setItem(KEY, state);
  } catch {}
  applyConsent(state);
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: state }));
  } catch {}
}

/** Push the consent decision into the native Firebase layer. */
export function applyConsent(state: ConsentState) {
  // Treat unknown as denied until the user explicitly grants.
  const enabled = state === "granted";
  Analytics.setEnabled(enabled).catch(() => {});
}

export function onConsentChange(cb: (state: ConsentState) => void) {
  const handler = (e: Event) => cb((e as CustomEvent).detail as ConsentState);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

export const ANALYTICS_CONSENT_EVENT = EVENT;
