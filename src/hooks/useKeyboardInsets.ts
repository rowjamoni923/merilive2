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

    if (isNativeApp()) {
      let showHandle: { remove: () => Promise<void> } | null = null;
      let hideHandle: { remove: () => Promise<void> } | null = null;
      let cancelled = false;

      import('@capacitor/keyboard')
        .then(async ({ Keyboard }) => {
          if (cancelled) return;
          showHandle = await Keyboard.addListener('keyboardWillShow', (info) => {
            setKb(info?.keyboardHeight ?? 0);
          });
          hideHandle = await Keyboard.addListener('keyboardWillHide', () => {
            setKb(0);
          });
        })
        .catch(() => { /* plugin missing on web build — ignore */ });

      return () => {
        cancelled = true;
        showHandle?.remove().catch(() => {});
        hideHandle?.remove().catch(() => {});
        setKb(0);
      };
    }

    // Web fallback via visualViewport
    if (typeof window === 'undefined' || !('visualViewport' in window) || !window.visualViewport) {
      return;
    }
    const vv = window.visualViewport;
    const onResize = () => {
      const diff = window.innerHeight - vv.height - vv.offsetTop;
      setKb(diff > 80 ? diff : 0); // 80px guard against browser chrome jitter
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
      setKb(0);
    };
  }, []);
}

export default useKeyboardInsets;
