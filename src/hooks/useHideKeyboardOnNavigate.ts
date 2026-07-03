/**
 * Chamet/Bigo/WhatsApp-parity: automatically dismiss the on-screen keyboard
 * whenever the user navigates to a different route (route path change).
 *
 * Why: keeping a focused <input> across a route change on Android WebView
 * causes the composer of the OLD page to briefly render on top of the NEW
 * page while `visualViewport` catches up, producing the "keyboard glitch"
 * users perceive as a UI break.
 *
 * Native path: @capacitor/keyboard `Keyboard.hide()`.
 * Web path:    blur the active input (which triggers the browser to hide
 *              the software keyboard).
 *
 * Zero-cost when no keyboard is open.
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { isNativeApp } from '@/utils/nativeUtils';

export function useHideKeyboardOnNavigate() {
  const { pathname } = useLocation();
  const prev = useRef(pathname);

  useEffect(() => {
    if (prev.current === pathname) return;
    prev.current = pathname;

    // Only act if a keyboard is likely open (input focused OR native kb open).
    const active = document.activeElement as HTMLElement | null;
    const looksFocused =
      !!active &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        (active as any).isContentEditable === true);
    const nativeKbOpen = document.documentElement.getAttribute('data-kb-open') === 'true';
    if (!looksFocused && !nativeKbOpen) return;

    // Web fallback — blur triggers keyboard-hide across all mobile browsers.
    try { active?.blur(); } catch { /* ignore */ }

    if (isNativeApp()) {
      import('@capacitor/keyboard')
        .then(({ Keyboard }) => { Keyboard.hide().catch(() => {}); })
        .catch(() => { /* plugin missing on web build — ignore */ });
    }
  }, [pathname]);
}

export default useHideKeyboardOnNavigate;
