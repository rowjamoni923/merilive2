/**
 * Pkg255 — Shake detector JS wrapper.
 *
 * Thin bridge around native ShakeDetectorPlugin. Safe no-op on web/iOS.
 * Respects single localStorage toggle `merilive_shake_feedback_enabled`.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

interface ShakeDetectorShape {
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(
    event: 'shake',
    cb: (data: { gForce: number; at: number }) => void,
  ): Promise<PluginListenerHandle>;
}

const Native = registerPlugin<ShakeDetectorShape>('ShakeDetector');

const PREF_KEY = 'merilive_shake_feedback_enabled';

export function isShakeFeedbackEnabled(): boolean {
  try { return localStorage.getItem(PREF_KEY) !== '0'; } catch { return true; }
}

export function setShakeFeedbackEnabled(enabled: boolean) {
  try { localStorage.setItem(PREF_KEY, enabled ? '1' : '0'); } catch {}
}

export function isShakeSupported(): boolean {
  return Capacitor.getPlatform() === 'android';
}

export async function startShakeDetector(): Promise<void> {
  if (!isShakeSupported()) return;
  try { await Native.start(); } catch {}
}

export async function stopShakeDetector(): Promise<void> {
  if (!isShakeSupported()) return;
  try { await Native.stop(); } catch {}
}

export async function onShake(
  cb: (data: { gForce: number; at: number }) => void,
): Promise<PluginListenerHandle | null> {
  if (!isShakeSupported()) return null;
  try { return await Native.addListener('shake', cb); } catch { return null; }
}
