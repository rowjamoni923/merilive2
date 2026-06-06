import { useEffect, useRef } from 'react';
import {
  NativeRouterShell,
  isNativeRouterShellAvailable,
  type NativeRouterTab,
} from '@/plugins/NativeRouterShell';
import { isNativeRouterShellEnabled } from '@/utils/routerShellNativeFlag';

interface Options {
  enabled?: boolean;
  title: string;
  tabs: NativeRouterTab[];
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
}

/**
 * Pkg434 — additive native bottom-tab + top-bar shell. WebView still renders route content.
 * No-op unless platform=android AND localStorage flag 'routerShell:native'='on' AND enabled=true.
 */
export function useNativeRouterShell({
  enabled = true,
  title,
  tabs,
  activeTabId,
  onTabChange,
}: Options) {
  const active = enabled && isNativeRouterShellAvailable() && isNativeRouterShellEnabled();
  const onTabRef = useRef(onTabChange);
  onTabRef.current = onTabChange;

  // Mount/unmount shell
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    let sub: { remove: () => void } | null = null;
    (async () => {
      await NativeRouterShell.open({ title, tabs, activeTabId });
      if (!mounted) return;
      const h = await NativeRouterShell.addListener('router:tab', (data) => {
        onTabRef.current?.(data.tabId);
      });
      sub = h;
    })();
    return () => {
      mounted = false;
      try { sub?.remove(); } catch { /* noop */ }
      NativeRouterShell.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Sync title
  useEffect(() => {
    if (!active) return;
    NativeRouterShell.setTitle({ title }).catch(() => {});
  }, [active, title]);

  // Sync tabs (incl. badges)
  useEffect(() => {
    if (!active) return;
    NativeRouterShell.setTabs({ tabs }).catch(() => {});
  }, [active, tabs]);

  // Sync active tab
  useEffect(() => {
    if (!active || !activeTabId) return;
    NativeRouterShell.setActiveTab({ tabId: activeTabId }).catch(() => {});
  }, [active, activeTabId]);

  return { active };
}
