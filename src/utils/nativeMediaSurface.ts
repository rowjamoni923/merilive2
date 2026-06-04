/**
 * Pkg428 — Synchronous control of the `native-media-active` body class.
 *
 * The class makes <body> transparent so the native Android LiveKit
 * TextureView (mounted BEHIND the WebView) shows through. If we let
 * React's useEffect cleanup remove it, there is a 1-2 frame window after
 * navigation where the next page has mounted but body is still
 * transparent — the user briefly sees the black Activity window behind
 * the WebView (the "kalo flash" on exit from Live/Party/GoLive).
 *
 * Always call `clearNativeMediaSurface()` synchronously right before
 * `navigate(...)` away from any page that uses native camera/LiveKit.
 */

const CLASSES = ['native-media-active', 'native-face-camera-active'] as const;

export function clearNativeMediaSurface(): void {
  if (typeof document === 'undefined') return;
  try {
    for (const cls of CLASSES) {
      document.documentElement.classList.remove(cls);
      document.body.classList.remove(cls);
    }
  } catch {
    /* noop */
  }
}

export function setNativeMediaSurface(active: boolean): void {
  if (typeof document === 'undefined') return;
  try {
    if (active) {
      document.documentElement.classList.add('native-media-active');
      document.body.classList.add('native-media-active');
    } else {
      clearNativeMediaSurface();
    }
  } catch {
    /* noop */
  }
}
