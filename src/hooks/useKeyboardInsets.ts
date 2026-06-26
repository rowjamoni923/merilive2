/**
 * Pkg434 Pass 2 — Native keyboard inset bridge.
 *
 * Exposes the on-screen keyboard height as a CSS variable `--kb-h` (px)
 * on <html>, so chat input bars, bottom sheets and FABs can lift smoothly
 * above the keyboard with `padding-bottom: var(--kb-h)` or
 * `bottom: var(--kb-h)`. Also toggles `data-kb-open` on <html> for
 * conditional styling.
 *
 * Web fallback uses the visualViewport API.
 *
 * Zero risk to gift / entry / camera / LiveKit — purely CSS variable.
 */
import { useEffect } from 'react';
import { isNativeApp } from '@/utils/nativeUtils';

function setKb(px: number) {
  const root = document.documentElement;
  root.style.setProperty('--kb-h', `${Math.max(0, Math.round(px))}px`);
  if (px > 0) root.setAttribute('data-kb-open', 'true');
  else root.removeAttribute('data-kb-open');
}

export function useKeyboardInsets() {
  useEffect(() => {
    setKb(0);
    let lastKb = 0;
    let raf = 0;
    const commitKb = (next: number) => {
      const rounded = Math.max(0, Math.round(next));
      if (Math.abs(rounded - lastKb) < 4) return;
      lastKb = rounded;
      setKb(rounded);
    };

    if (isNativeApp()) {
      const handles: Array<{ remove: () => Promise<void> }> = [];
      let cancelled = false;

      import('@capacitor/keyboard')
        .then(async ({ Keyboard }) => {
          if (cancelled) return;
          // iOS fires keyboardWillShow/Hide; Android only fires keyboardDidShow/Hide.
          // Subscribe to BOTH so Samsung / Pixel / OnePlus all lift the composer.
          const onShow = (info: { keyboardHeight?: number } | undefined) =>
            commitKb(info?.keyboardHeight ?? 0);
          const onHide = () => commitKb(0);
          handles.push(await Keyboard.addListener('keyboardWillShow', onShow));
          handles.push(await Keyboard.addListener('keyboardDidShow', onShow));
          handles.push(await Keyboard.addListener('keyboardWillHide', onHide));
          handles.push(await Keyboard.addListener('keyboardDidHide', onHide));
        })
        .catch(() => { /* plugin missing on web build — ignore */ });

      return () => {
        cancelled = true;
        handles.forEach((h) => { h.remove().catch(() => {}); });
        setKb(0);
      };
    }

    // Web fallback via visualViewport
    if (typeof window === 'undefined' || !('visualViewport' in window) || !window.visualViewport) {
      return;
    }
    const vv = window.visualViewport;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const diff = window.innerHeight - vv.height - vv.offsetTop;
        commitKb(diff > 100 ? diff : 0); // 100px guard against browser chrome jitter
      });
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    return () => {
      cancelAnimationFrame(raf);
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
      setKb(0);
    };
  }, []);
}

export default useKeyboardInsets;
