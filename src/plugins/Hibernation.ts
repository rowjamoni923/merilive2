/**
 * Pkg235 — M29 App hibernation safety.
 *
 * Thin JS wrapper around the native HibernationPlugin (Android only).
 * Safe no-op on web/iOS.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export type HibernationStatus =
  | 'DISABLED'
  | 'API_30'
  | 'API_30_BACKPORT'
  | 'API_31'
  | 'FEATURE_NOT_AVAILABLE'
  | 'ERROR';

export interface HibernationStatusResult {
  status: HibernationStatus;
  shouldPrompt: boolean;
  error?: string;
}

interface HibernationPluginShape {
  getStatus(): Promise<HibernationStatusResult>;
  requestDisable(): Promise<{ launched: boolean }>;
}

const Native = registerPlugin<HibernationPluginShape>('Hibernation');

const PROMPT_KEY = 'merilive_hibernation_prompted_at';
const MIN_GAP_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function isHibernationSupported(): boolean {
  return Capacitor.getPlatform() === 'android';
}

export async function getHibernationStatus(): Promise<HibernationStatusResult> {
  if (!isHibernationSupported()) {
    return { status: 'FEATURE_NOT_AVAILABLE', shouldPrompt: false };
  }
  try {
    return await Native.getStatus();
  } catch (e: any) {
    return { status: 'ERROR', shouldPrompt: false, error: String(e?.message ?? e) };
  }
}

export async function openHibernationSettings(): Promise<boolean> {
  if (!isHibernationSupported()) return false;
  try {
    const r = await Native.requestDisable();
    try { localStorage.setItem(PROMPT_KEY, String(Date.now())); } catch {}
    return !!r?.launched;
  } catch {
    return false;
  }
}

/** Has the user been asked within the last 30 days? */
export function recentlyPrompted(): boolean {
  try {
    const last = Number(localStorage.getItem(PROMPT_KEY) || '0');
    return Date.now() - last < MIN_GAP_MS;
  } catch {
    return false;
  }
}

export function markPrompted(): void {
  try { localStorage.setItem(PROMPT_KEY, String(Date.now())); } catch {}
}
