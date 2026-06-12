/**
 * ViewerSession — JS bridge for the Android viewer-side media-playback
 * foreground service. Keeps live / party AUDIO + LiveKit subscriber
 * connection running when the app is minimized or the screen turns off.
 *
 * Hosts (publishers) must NOT call this — `CallForegroundService` (camera
 * + microphone FGS) already covers that path via LiveKitPlugin.connect().
 *
 * Web / iOS: no-op. Safe to call unconditionally.
 */
import { registerPlugin, Capacitor } from '@capacitor/core';

export type ViewerSessionKind = 'live' | 'party';

export interface ViewerSessionStartOptions {
  kind: ViewerSessionKind;
  /** Short notification title, e.g. "Watching @hostname". */
  title?: string;
  /** Notification subtitle line. */
  subtitle?: string;
}

export interface ViewerSessionPlugin {
  start(opts: ViewerSessionStartOptions): Promise<{ ok: boolean }>;
  stop(): Promise<{ ok: boolean }>;
}

const native = registerPlugin<ViewerSessionPlugin>('ViewerSession');

export function isViewerSessionAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function startViewerSession(opts: ViewerSessionStartOptions): Promise<void> {
  if (!isViewerSessionAvailable()) return;
  try {
    await native.start(opts);
  } catch (err) {
    console.warn('[ViewerSession] start failed:', err);
  }
}

export async function stopViewerSession(): Promise<void> {
  if (!isViewerSessionAvailable()) return;
  try {
    await native.stop();
  } catch (err) {
    console.warn('[ViewerSession] stop failed:', err);
  }
}

export const ViewerSession = native;
