/**
 * androidCameraHandoff — STUB (Step 1 rebuild, 2026-06-14).
 *
 * The WebView ↔ native camera handoff is no longer needed: the new
 * minimal LiveKit plugin (Step 2) will own the camera directly via the
 * SDK's built-in Camera2Capturer. All helpers are safe no-ops so
 * existing callers compile until they are removed.
 */

export async function claimAndroidWebViewCamera(_reason: string): Promise<boolean> {
  return false;
}

export function releaseAndroidWebViewCamera(_reason: string): void { /* no-op */ }

export async function releaseAndroidWebViewCameraNow(_reason: string): Promise<void> { /* no-op */ }

export async function getAndroidCameraOwner(): Promise<string | null> {
  return null;
}

export function releaseAndroidWebViewCameraWhenStopped(
  _stream: MediaStream | null | undefined,
  _reason: string,
): void { /* no-op */ }

export function stopMediaStreamAndReleaseAndroidCamera(
  stream: MediaStream | null | undefined,
  _reason: string,
): void {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
}

export async function claimAndroidWebViewCameraForStream<T extends MediaStream | null>(
  factory: () => Promise<T>,
  _reason: string,
): Promise<T> {
  return factory();
}
